importScripts("providers.js");

async function getSettings() {
  const s = await chrome.storage.local.get(["provider", "keys", "models", "lists", "mode", "acc31", "verify"]);
  if (!s.acc31) {
    // v3.1: move Groq users off weaker auto-picked models to the most accurate one
    s.models = s.models || {}; s.lists = s.lists || {};
    delete s.models.groq; delete s.lists.groq;
    await chrome.storage.local.set({ models: s.models, lists: s.lists, acc31: true });
  }
  const provider = s.provider || "groq";
  const keys = s.keys || {};
  const models = s.models || {};
  const list = (s.lists && s.lists[provider] && s.lists[provider].length) ? s.lists[provider] : EC_PROVIDERS[provider].models;
  return {
    provider,
    list,
    key: keys[provider] || "",
    model: models[provider] || list[0].id,
    mode: EC_MODES[s.mode] ? s.mode : EC_DEFAULT_MODE,
    verify: s.verify !== false
  };
}

function isVision(list, model) {
  const m = list.find((x) => x.id === model);
  return m ? m.vision : true;
}

async function readError(res) {
  const t = await res.text();
  try {
    const j = JSON.parse(t);
    return j?.error?.message || j?.message || t;
  } catch (_) {
    return t || "HTTP " + res.status;
  }
}

// ---------- local OCR via offscreen document ----------
let creatingOffscreen = null;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL("offscreen.html");
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (existing.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Run OCR on screenshots locally"
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

// On a full-screen capture, keep only the column that holds the question (drops sidebars/menus).
// Works word-by-word because OCR often merges a sidebar item and the question into one line.
function focusQuestion(lines) {
  const isQ = (t) => /\?\s*(\(.*\))?\s*$|\(choose\s+\w+\)|select\s+(one|two|three|all)/i.test(t);
  const qs = lines.filter((l) => isQ(l.text) && l.text.length > 15);
  if (!qs.length) return null;
  const q = qs.reduce((a, b) => (b.bbox.x1 - b.bbox.x0 > a.bbox.x1 - a.bbox.x0 ? b : a));
  const words = q.words && q.words.length ? q.words : [{ text: q.text, bbox: q.bbox }];
  const h = Math.max(8, q.bbox.y1 - q.bbox.y0);
  // Question starts after the widest horizontal gap in its line (if that gap is clearly a column break)
  let colLeft = words[0].bbox.x0, best = 0;
  for (let k = 1; k < words.length; k++) {
    const gap = words[k].bbox.x0 - words[k - 1].bbox.x1;
    if (gap > best) { best = gap; if (gap > h * 2.2) colLeft = words[k].bbox.x0; }
  }
  const tol = h * 1.5, top = q.bbox.y0 - h * 4;
  const out = [];
  for (const l of lines) {
    if (l.bbox.y1 < top) continue;
    const ws = (l.words && l.words.length ? l.words : [{ text: l.text, bbox: l.bbox }]).filter((w) => w.bbox.x0 >= colLeft - tol);
    if (ws.length) out.push(ws.map((w) => w.text).join(" "));
  }
  return out.join("\n");
}

// Enlarge + grayscale + stretch contrast: light grey text on light boxes OCRs much better
async function preprocessForOcr(dataUrl) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = Math.max(1, Math.min(3, 3800 / bmp.width));
  const c = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    let y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    y = y > 200 ? 255 : Math.max(0, (y - 40) * 1.6); // whiten backgrounds, darken text
    px[i] = px[i + 1] = px[i + 2] = y;
  }
  g.putImageData(d, 0, 0);
  const blob = await c.convertToBlob({ type: "image/png" });
  return bufToDataUrl(await blob.arrayBuffer(), "image/png");
}

async function ocrImage(image, cropped) {
  image = await preprocessForOcr(image);
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "ocr", image });
  if (!res || !res.ok) throw new Error(res?.error || "OCR failed.");
  let text = res.text;
  if (!cropped && res.lines?.length) text = focusQuestion(res.lines) || text;
  if (text.replace(/\s/g, "").length < 5) throw new Error("No readable text found. Use 'Select Area' and drag around the question.");
  return text;
}

const IMAGE_REJECTED = /image|vision|multimodal|content must be a string|does not support|unsupported/i;

// image = data URL (jpeg) or null; text = string or null
async function callAI({ text, image, cropped }) {
  const { list, model } = await getSettings();
  let args, answer;
  if (image && !isVision(list, model)) {
    // Text-only model → read the screenshot locally, then send the text
    args = { text: await ocrImage(image, cropped), fromScreen: true };
    answer = await callModel(args);
  } else {
    try {
      args = { text, image };
      answer = await callModel(args);
    } catch (e) {
      if (!(image && IMAGE_REJECTED.test(e.message))) throw e;
      args = { text: await ocrImage(image, cropped), fromScreen: true };
      answer = await callModel(args);
    }
  }
  if (!text || !/Reply with the single word/.test(text)) answer = await doubleCheck(args, answer);
  return answer;
}

// ---------- double-check: an independent second solve; flag disagreement honestly ----------
const VERIFY_PROMPT =
  "You are an independent, strict examiner. Ignore any page clutter (menus, sidebars, course outlines). " +
  "For each real multiple-choice question in the input, solve it yourself from scratch, following the course material it comes from. " +
  "Test every option against the stem; respect NOT/BEST/'Choose two'. " +
  "Output ONLY one line per question: the correct option text(s) exactly as shown, separated by ' || ' when more than one. " +
  "Then a final line: CONFIDENCE: high, medium or low. No explanations.";

const norm = (t) => (t || "").toLowerCase().replace(/^[\s✅✔✘*•\-]*(answer:)?/i, "").replace(/\(.*?(choose|all correct).*?\)/gi, "").replace(/[^a-z0-9.:/ ]+/g, " ").replace(/\s+/g, " ").trim();

function answerLines(answer) {
  return [...answer.matchAll(/✅\s*Answer:\s*(.+)/g)].map((m) => m[1]);
}

async function doubleCheck(args, answer) {
  const { mode, verify } = await getSettings();
  if (verify === false || !["practice", "explain_mcq"].includes(mode)) return answer;
  const mine = answerLines(answer);
  if (!mine.length) return answer; // no MCQ answer to check
  let second;
  try { second = await callModel({ ...args, system: VERIFY_PROMPT }); } catch (_) {
    return answer + "\n\n⚠ Double-check could not run — confirm this answer with your course notes.";
  }
  const lines = second.split("\n").map((l) => l.trim()).filter(Boolean);
  const conf = (second.match(/CONFIDENCE:\s*(high|medium|low)/i) || [, "medium"])[1].toLowerCase();
  const picks = lines.filter((l) => !/^CONFIDENCE:/i.test(l)).flatMap((l) => l.split(/\s*\|\|\s*/)).map(norm).filter(Boolean);
  const mineText = norm(mine.join(" "));
  const agree = picks.length > 0 && picks.every((p) => mineText.includes(p) || p.includes(mineText));
  if (agree && conf === "high") return answer + "\n\n✔ Double-checked: an independent second check gave the same answer.";
  if (agree) return answer + "\n\n✔ Double-checked (same answer), but confidence is " + conf + " — confirm with your course notes.";
  const theirs = lines.filter((l) => !/^CONFIDENCE:/i.test(l)).join(" ; ");
  return answer + "\n\n⚠ NOT CERTAIN: an independent second check chose “" + theirs + "”. " +
    "The two checks disagree, so do not memorise this answer — verify it in your course material.";
}

const MODEL_GONE = /model.*(does not exist|not found|decommissioned|not available|no access|do not have access)|unknown model/i;

async function callModel(args) {
  try {
    return await callModelOnce(args);
  } catch (e) {
    if (!MODEL_GONE.test(e.message)) throw e;
    // The saved model was retired → fetch the live list, switch to the best one, retry once
    const { provider, key } = await getSettings();
    const list = await ecFetchModels(provider, key);
    const s = await chrome.storage.local.get(["models", "lists"]);
    s.models = s.models || {}; s.lists = s.lists || {};
    s.lists[provider] = list; s.models[provider] = ecBestModel(provider, list);
    await chrome.storage.local.set(s);
    return callModelOnce(args);
  }
}

const clean = (t) => (t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim() || "No answer returned.";

async function callModelOnce({ text, image, fromScreen, system: systemOverride }) {
  const { provider, key, model, mode } = await getSettings();
  if (!key) throw new Error("No API key. Click the extension icon → paste your " + EC_PROVIDERS[provider].label + " key → Activate & Save.");
  if (fromScreen) text = "[Text read from a screenshot by OCR. It may include page clutter such as menus, sidebars, buttons and course outlines — ignore all of that. Checkbox/radio symbols may appear as stray characters like O, 0, (m]. Option words may be slightly misspelled by OCR (e.g. upp = UDP, Tcp = TCP) — infer the intended option and write it correctly.]\n" + text;

  const system = systemOverride || EC_MODES[mode].prompt;
  const userText = text
    ? "Input:\n" + text
    : "The image is a screenshot of the user's screen. Find the actual question and its answer options (ignore sidebars, menus, navigation and course outlines) and respond.";
  const b64 = image ? image.split(",")[1] : null;

  let res;
  if (provider === "groq" || provider === "openai") {
    const url = provider === "groq"
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const content = image
      ? [{ type: "text", text: userText }, { type: "image_url", image_url: { url: image } }]
      : userText;
    const body = { model, messages: [{ role: "system", content: system }, { role: "user", content }] };
    let extras = {};
    if (provider === "groq" && /gpt-oss/.test(model)) extras = { reasoning_effort: "medium", include_reasoning: false, max_tokens: 6000 };
    else if (provider === "groq" && /qwen3|deepseek-r1/.test(model)) extras = { reasoning_format: "hidden", max_tokens: 6000 };
    else if (provider === "openai" && /^(o\d|gpt-5)/.test(model)) extras = { max_completion_tokens: 6000 };
    else extras = { temperature: 0, max_tokens: 1500 };
    const send = (b) => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(b)
    });
    res = await send({ ...body, ...extras });
    if (!res.ok) {
      const err = await readError(res);
      // Some models reject reasoning/temperature params → retry plain
      if (/reasoning|include_reasoning|temperature|max_tokens|unsupported parameter|not supported/i.test(err) && !MODEL_GONE.test(err)) {
        res = await send({ ...body, max_tokens: 4000 });
        if (!res.ok) throw new Error(await readError(res));
      } else throw new Error(err);
    }
    const d = await res.json();
    return clean(d.choices?.[0]?.message?.content);
  }

  if (provider === "gemini") {
    const parts = [{ text: userText }];
    if (image) parts.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
    res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) +
        ":generateContent?key=" + encodeURIComponent(key),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0, maxOutputTokens: 8192 }
        })
      }
    );
    if (!res.ok) throw new Error(await readError(res));
    const d = await res.json();
    return clean(d.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join(""));
  }

  if (provider === "claude") {
    const content = [];
    if (image) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } });
    content.push({ type: "text", text: userText });
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model, max_tokens: 2000, temperature: 0, system, messages: [{ role: "user", content }] })
    });
    if (!res.ok) throw new Error(await readError(res));
    const d = await res.json();
    return clean(d.content?.map((c) => c.text || "").join(""));
  }

  throw new Error("Unknown provider.");
}

async function captureTab(windowId) {
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

function bufToDataUrl(buf, mime) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return "data:" + mime + ";base64," + btoa(bin);
}

// Crop to rect (CSS px) and enlarge small text so OCR / vision models read it reliably
async function prepareImage(dataUrl, rect, dpr) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (rect) {
    sx = Math.max(0, Math.round(rect.x * dpr)); sy = Math.max(0, Math.round(rect.y * dpr));
    sw = Math.min(bmp.width - sx, Math.round(rect.w * dpr)); sh = Math.min(bmp.height - sy, Math.round(rect.h * dpr));
  }
  const scale = Math.min(3, Math.max(1, 1600 / Math.max(sw, 1)));
  const c = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  return bufToDataUrl(await blob.arrayBuffer(), "image/jpeg");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "offscreen") return false;
  (async () => {
    try {
      if (msg.type === "ask-text") {
        sendResponse({ ok: true, answer: await callAI({ text: msg.text }) });
      } else if (msg.type === "ask-shot") {
        const raw = await captureTab(sender.tab?.windowId);
        const image = await prepareImage(raw, msg.rect, msg.dpr || 1);
        sendResponse({ ok: true, answer: await callAI({ image, cropped: !!msg.rect }) });
      } else if (msg.type === "test-key") {
        sendResponse({ ok: true, answer: await callAI({ text: "Reply with the single word: OK" }) });
      }
    } catch (e) {
      let m = e.message || String(e);
      if (/failed to fetch|networkerror/i.test(m)) m = "Couldn't reach the AI provider. Check your internet connection and try again.";
      sendResponse({ ok: false, error: m });
    }
  })();
  return true;
});

// Keyboard shortcuts → tell the content script to run the action
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const action = command === "ask-screenshot" ? "shot" : command === "ask-area" ? "area" : "text";
  chrome.tabs.sendMessage(tab.id, { type: "run", action }).catch(() => {});
});
