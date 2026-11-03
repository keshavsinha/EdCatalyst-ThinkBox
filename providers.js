// Shared provider + model list (used by popup and background)
const EC_PROVIDERS = {
  claude: {
    label: "Claude",
    keyHint: "console.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    note: "Vision + text (paid)",
    models: [
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 — Vision ✓", vision: true },
      { id: "claude-haiku-5-5", name: "Claude Haiku 5.5 — Vision ✓ (fast)", vision: true },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5 — Vision ✓ (best)", vision: true }
    ]
  },
  openai: {
    label: "OpenAI",
    keyHint: "platform.openai.com",
    keyUrl: "https://platform.openai.com/api-keys",
    note: "Vision + text (paid)",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o mini — Vision ✓ (cheap)", vision: true },
      { id: "gpt-4o", name: "GPT-4o — Vision ✓", vision: true },
      { id: "gpt-4.1-mini", name: "GPT-4.1 mini — Vision ✓", vision: true }
    ]
  },
  gemini: {
    label: "Gemini",
    keyHint: "aistudio.google.com",
    keyUrl: "https://aistudio.google.com/app/apikey",
    note: "Vision + text, free tier",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash — Vision ✓", vision: true },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro — Vision ✓", vision: true },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash — Vision ✓", vision: true }
    ]
  },
  groq: {
    label: "Groq",
    keyHint: "console.groq.com",
    keyUrl: "https://console.groq.com/keys",
    note: "Vision + text, 100% free",
    models: [
      { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B ★ Most accurate (screenshots via OCR)", vision: false },
      { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2 — Text (screenshots via OCR)", vision: false },
      { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B — Text (screenshots via OCR)", vision: false },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout — Vision ✓ (less accurate)", vision: true }
    ]
  }
};

// ---------- model helpers (shared by popup + background) ----------
const EC_NOT_CHAT = /whisper|tts|guard|orpheus|playai|embed|moderation|dall-e|image|audio|realtime|transcribe|search|computer-use|aqa|imagen|veo|safeguard|compound|allam/i;
function ecGuessVision(provider, id) {
  if (provider === "groq") return /llama-4|scout|maverick|vision|vl\b|-vl|llava|gemma-3/i.test(id);
  if (provider === "openai") return /gpt-4o|gpt-4\.1|gpt-5|o3|o4/i.test(id);
  return true;
}
// Ranked most → least accurate for exam-style questions
const EC_RANK = {
  groq: [/gpt-oss-120b/, /kimi-k2/, /qwen3-32b/, /llama-3\.3-70b/, /llama-4-maverick/, /gpt-oss-20b/, /llama-4-scout/],
  openai: [/^gpt-5-mini$/, /^gpt-4\.1$/, /^gpt-4o$/, /^gpt-4\.1-mini$/, /^gpt-4o-mini$/],
  gemini: [/^gemini-2\.5-flash$/, /^gemini-2\.5-pro$/, /flash/, /pro/],
  claude: [/sonnet/, /opus/, /haiku/]
};
function ecBestModel(provider, list) {
  for (const re of EC_RANK[provider] || []) { const m = list.find((x) => re.test(x.id)); if (m) return m.id; }
  return list[0].id;
}
function ecLabel(provider, id) {
  const best = (EC_RANK[provider] || [])[0];
  const star = best && best.test(id) ? " ★ Most accurate" : "";
  return id + star + (ecGuessVision(provider, id) ? " — Vision ✓" : " — Text (screenshots via OCR)");
}
async function ecFetchModels(provider, key) {
  let ids = [];
  const J = async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error?.message || "HTTP " + r.status); return d; };
  if (provider === "groq" || provider === "openai") {
    const url = provider === "groq" ? "https://api.groq.com/openai/v1/models" : "https://api.openai.com/v1/models";
    const d = await J(await fetch(url, { headers: { Authorization: "Bearer " + key } }));
    ids = (d.data || []).filter((m) => m.active !== false).map((m) => m.id);
    if (provider === "openai") ids = ids.filter((id) => /^(gpt-|o\d|chatgpt)/.test(id));
  } else if (provider === "gemini") {
    const d = await J(await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" + encodeURIComponent(key)));
    ids = (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, "")).filter((id) => /^gemini/.test(id));
  } else if (provider === "claude") {
    const d = await J(await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
    }));
    ids = (d.data || []).map((m) => m.id);
  }
  ids = ids.filter((id) => !EC_NOT_CHAT.test(id)).sort();
  if (!ids.length) throw new Error("No chat models found for this key.");
  return ids.map((id) => ({ id, name: ecLabel(provider, id), vision: ecGuessVision(provider, id) }));
}

// Shared accuracy rules added to every answer-giving mode
const EC_ACCURACY =
  "Accuracy rules: answer the way the source course material teaches it (e.g. Cisco Networking Academy / CCNA / CyberOps, CompTIA, the textbook) — use its exact definitions and terminology. " +
  "Read the question stem carefully for qualifiers such as NOT, BEST, MOST, FIRST, 'both', 'Choose two'. " +
  "Before deciding, test EVERY option against the stem; never pick an option only because it sounds familiar. " +
  "Work only with a real question and options that appear in the input; never invent questions from menus, headings or course outlines; choose only from the options shown; if it says 'Choose two/three', give exactly that many.\n";

const EC_MODES = {
  practice: {
    label: "Practice — hint first, then answer",
    prompt:
      "You are a patient tutor helping a student practise. The input contains a question (often multiple-choice) surrounded by unrelated page text.\n" +
      EC_ACCURACY +
      "Reply in exactly this structure:\n" +
      "Hint: <one or two lines pointing toward the key concept WITHOUT revealing the answer>\n" +
      "===ANSWER===\n" +
      "Options:\n<one line per option: ✔ or ✘, option text — short reason>\n" +
      "✅ Answer: <option text exactly as shown> (all correct options if 'Choose two/three')\n" +
      "Why: <2-3 lines explaining the concept>\n" +
      "If no real question is visible, reply only: No question found — use Select Area and drag around the question."
  },
  explain_mcq: {
    label: "MCQ — answer with full explanation",
    prompt:
      "You are a tutor. The input contains one or more multiple-choice questions surrounded by unrelated page text.\n" +
      EC_ACCURACY +
      "For each real question reply:\n" +
      "Q: <question, shortened>\nOptions:\n<one line per option: ✔ or ✘, option text — short reason>\n" +
      "✅ Answer: <option text exactly as shown>\nWhy: <2-3 lines on the underlying concept>\n" +
      "If no real question is visible, reply only: No question found — use Select Area and drag around the question."
  },
  concept: {
    label: "Teach the concept — no answer",
    prompt:
      "You are a tutor. Do NOT state which option is correct. Explain the concept the question is testing in 4-6 short lines, " +
      "with a simple example, so the student can work out the answer themselves."
  },
  explain: {
    label: "Explain — step by step",
    prompt: EC_ACCURACY + "Work through the question(s) in the input step by step, then give the final answer clearly."
  },
  code: {
    label: "Coding — solve & explain",
    prompt: "Solve the programming question in the input. Explain the approach first, then give the code with brief comments."
  },
  summary: {
    label: "Summarise — key points",
    prompt: "Summarise the input as 3-6 short bullet points for revision."
  }
};
const EC_DEFAULT_MODE = "practice";
