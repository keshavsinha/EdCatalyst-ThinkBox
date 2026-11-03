// Local OCR (no internet needed) — used when the chosen model can't read images
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    const base = chrome.runtime.getURL("ocr/");
    workerPromise = Tesseract.createWorker("eng", 1, {
      workerPath: base + "worker.min.js",
      corePath: base,
      langPath: base,
      gzip: true,
      workerBlobURL: false,
      cacheMethod: "none"
    }).catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

async function ocr(dataUrl) {
  const w = await getWorker();
  const { data } = await w.recognize(dataUrl, {}, { text: true, blocks: true });
  const lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const t = (l.text || "").trim();
    if (t) lines.push({ text: t, bbox: l.bbox, words: (l.words || []).map((w) => ({ text: w.text, bbox: w.bbox })).filter((w) => w.text.trim()) });
  }
  const text = (data.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, lines };
}

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg?.target !== "offscreen" || msg.type !== "ocr") return false;
  ocr(msg.image)
    .then((r) => sendResponse({ ok: true, text: r.text, lines: r.lines }))
    .catch((e) => sendResponse({ ok: false, error: "OCR failed: " + (e?.message || e) }));
  return true;
});
