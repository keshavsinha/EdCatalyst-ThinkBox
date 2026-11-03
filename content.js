(() => {
  if (window.__ecThinkBox) return;
  window.__ecThinkBox = true;

  const host = document.createElement("div");
  host.id = "ec-thinkbox-host";
  host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:0;bottom:0;width:0;height:0;";
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
<style>
  :host, * { box-sizing: border-box; font-family: "Poppins", system-ui, -apple-system, "Segoe UI", sans-serif; }
  .fab {
    position: fixed; right: 18px; bottom: 18px; display: flex; align-items: center; gap: 7px;
    background: linear-gradient(135deg,#ff7a45,#ff4d2e); color: #fff; border: 0; cursor: pointer;
    padding: 9px 16px 9px 12px; border-radius: 999px; font-size: 13px; font-weight: 700;
    box-shadow: 0 6px 18px rgba(255,77,46,.45); user-select: none;
  }
  .fab b { font-size: 10px; font-weight: 800; letter-spacing: .5px; background: rgba(255,255,255,.22); padding: 2px 4px; border-radius: 4px; }
  .menu {
    position: fixed; right: 18px; bottom: 64px; width: 240px; background: #14122b; color: #e8e6ff;
    border: 1px solid #8b2f3a; border-radius: 10px; padding: 6px; display: none;
    box-shadow: 0 10px 30px rgba(0,0,0,.45);
  }
  .menu.open { display: block; }
  .menu button {
    display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: none;
    border: 0; color: #f3f2ff; font-size: 12.5px; font-weight: 600; padding: 9px 10px; border-radius: 7px; cursor: pointer;
  }
  .menu button:hover { background: rgba(255,255,255,.08); }
  .menu hr { border: 0; border-top: 1px solid rgba(255,255,255,.1); margin: 4px 6px; }
  .menu .close { color: #8e8aa8; font-weight: 500; }
  .panel {
    position: fixed; right: 18px; bottom: 64px; width: 380px; max-width: calc(100vw - 36px);
    max-height: 60vh; display: none; flex-direction: column; background: #fff; color: #1f2937;
    border-radius: 12px; overflow: hidden; box-shadow: 0 14px 40px rgba(0,0,0,.3); border: 1px solid #ffd6c8;
  }
  .panel.open { display: flex; }
  .ph { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: linear-gradient(135deg,#ff7a45,#ff4d2e); color: #fff; }
  .ph .logo { background: rgba(255,255,255,.25); border-radius: 6px; font-size: 10px; font-weight: 800; padding: 3px 5px; }
  .ph .t { font-size: 13px; font-weight: 700; flex: 1; }
  .ph button { background: rgba(255,255,255,.2); border: 0; color: #fff; border-radius: 6px; font-size: 11px; font-weight: 600; padding: 4px 8px; cursor: pointer; }
  .pb { padding: 12px 14px; overflow: auto; font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; word-wrap: break-word; }
  .pb .err { color: #b91c1c; }
  .spin { display: inline-block; width: 14px; height: 14px; border: 2px solid #ffd2c2; border-top-color: #ff4d2e; border-radius: 50%; animation: s .8s linear infinite; vertical-align: -2px; margin-right: 6px; }
  @keyframes s { to { transform: rotate(360deg); } }
  .reveal { margin-top: 10px; background: #fff0e8; color: #c2410c; border: 1.5px solid #ffc9b6; border-radius: 8px; padding: 7px 12px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
  .ans { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ffd6c8; }
  .warn { display: block; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 7px 9px; font-weight: 600; }
  .good { display: block; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 8px; padding: 7px 9px; font-weight: 600; }
  .pf { font-size: 10.5px; color: #9ca3af; padding: 6px 14px 9px; border-top: 1px solid #f3f4f6; }
</style>
<div class="menu" id="menu">
  <button id="mText">📄 Explain Selected Text</button>
  <button id="mArea">✂️ Select Area → Explain (Best)</button>
  <button id="mShot">📸 Screenshot → Explain</button>
  <hr>
  <button id="mClose" class="close">✕ Close</button>
</div>
<div class="panel" id="panel">
  <div class="ph">
    <span class="logo">EC</span><span class="t">ThinkBox</span>
    <button id="copy">Copy</button><button id="x">✕</button>
  </div>
  <div class="pb" id="body"></div>
  <div class="pf">Alt+Shift+A text · Alt+Shift+S screenshot · Alt+Shift+X area</div>
</div>
<button class="fab" id="fab"><b>EC</b>ThinkBox</button>`;

  (document.body || document.documentElement).appendChild(host);

  const $ = (id) => root.getElementById(id);
  const menu = $("menu"), panel = $("panel"), body = $("body"), fab = $("fab");
  let lastSelection = "";
  let lastAnswer = "";

  // Remember the selection before clicking the button clears it
  document.addEventListener("selectionchange", () => {
    const s = window.getSelection()?.toString().trim();
    if (s) lastSelection = s;
  });
  fab.addEventListener("mousedown", (e) => e.preventDefault());
  menu.addEventListener("mousedown", (e) => e.preventDefault());

  fab.onclick = () => { panel.classList.remove("open"); menu.classList.toggle("open"); };
  $("mClose").onclick = () => menu.classList.remove("open");
  $("x").onclick = () => panel.classList.remove("open");
  $("copy").onclick = () => {
    navigator.clipboard.writeText(lastAnswer).then(() => { $("copy").textContent = "Copied"; setTimeout(() => ($("copy").textContent = "Copy"), 1200); }).catch(() => {});
  };

  function show(html) { menu.classList.remove("open"); panel.classList.add("open"); body.innerHTML = html; }
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(⚠ NOT CERTAIN:[^\n]*|⚠ Double-check could not run[^\n]*)/g, '<span class="warn">$1</span>')
    .replace(/(✔ Double-checked[^\n]*)/g, '<span class="good">$1</span>');

  function handle(res) {
    if (chrome.runtime.lastError) return show(`<span class="err">Error: ${esc(chrome.runtime.lastError.message)}. Reload the page.</span>`);
    if (!res) return show(`<span class="err">No response. Reload the page and try again.</span>`);
    if (!res.ok) return show(`<span class="err">⚠ ${esc(res.error)}</span>`);
    lastAnswer = res.answer.replace(/\n?===ANSWER===\n?/, "\n\n");
    const parts = res.answer.split(/\n?===ANSWER===\n?/);
    if (parts.length < 2) return show(fmt(res.answer));
    const unsure = /⚠ NOT CERTAIN/.test(parts[1]) ? `<span class="warn">⚠ The AI is not certain about this one — check your notes after revealing.</span>` : "";
    show(`${fmt(parts[0].trim())}${unsure}<br><button class="reveal" id="reveal">👀 Show answer</button><div class="ans" id="ans" hidden>${fmt(parts[1].trim())}</div>`);
    $("reveal").onclick = () => { $("ans").hidden = false; $("reveal").remove(); };
  }

  function askText() {
    const text = window.getSelection()?.toString().trim() || lastSelection;
    if (!text) return show(`<span class="err">Select the question and its options on the page first.</span>`);
    show(`<span class="spin"></span>Reading selected text…`);
    chrome.runtime.sendMessage({ type: "ask-text", text }, handle);
  }

  // Drag a box on the page → resolves {x,y,w,h} in CSS px, or null if cancelled
  function selectArea() {
    return new Promise((resolve) => {
      const ov = document.createElement("div");
      ov.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(15,10,30,.25);";
      const box = document.createElement("div");
      box.style.cssText = "position:fixed;border:2px dashed #ff5a36;background:rgba(255,90,54,.08);display:none;pointer-events:none;";
      const tip = document.createElement("div");
      tip.textContent = "Drag around the question and its options · Esc to cancel";
      tip.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#14122b;color:#fff;font:600 13px system-ui,sans-serif;padding:8px 14px;border-radius:8px;pointer-events:none;";
      ov.append(box, tip);
      document.documentElement.appendChild(ov);
      let sx = 0, sy = 0, dragging = false;
      const finish = (r) => { ov.remove(); document.removeEventListener("keydown", onKey, true); resolve(r); };
      const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); finish(null); } };
      document.addEventListener("keydown", onKey, true);
      ov.addEventListener("mousedown", (e) => { e.preventDefault(); dragging = true; sx = e.clientX; sy = e.clientY; box.style.display = "block"; });
      ov.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
        Object.assign(box.style, { left: x + "px", top: y + "px", width: Math.abs(e.clientX - sx) + "px", height: Math.abs(e.clientY - sy) + "px" });
      });
      ov.addEventListener("mouseup", (e) => {
        if (!dragging) return;
        dragging = false;
        const r = { x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy) };
        if (r.w < 20 || r.h < 20) return finish(null);
        finish(r);
      });
    });
  }

  // rect = null → whole visible screen
  function askShot(rect) {
    menu.classList.remove("open");
    panel.classList.remove("open");
    host.style.visibility = "hidden"; // keep our own UI out of the screenshot
    let done = false;
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: "ask-shot", rect: rect || null, dpr: window.devicePixelRatio || 1 }, (res) => {
        done = true;
        host.style.visibility = "visible";
        handle(res);
      });
      setTimeout(() => {
        if (done) return;
        host.style.visibility = "visible";
        show(`<span class="spin"></span>Reading ${rect ? "selected area" : "screen"}…`);
      }, 400);
    }, 150);
  }

  async function askArea() {
    menu.classList.remove("open");
    panel.classList.remove("open");
    host.style.visibility = "hidden";
    const r = await selectArea();
    host.style.visibility = "visible";
    if (!r) return;
    // wait a frame so the selection overlay is gone before capture
    requestAnimationFrame(() => requestAnimationFrame(() => askShot(r)));
  }

  $("mText").onclick = askText;
  $("mShot").onclick = () => askShot(null);
  $("mArea").onclick = askArea;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "run") return;
    if (msg.action === "shot") askShot(null);
    else if (msg.action === "area") askArea();
    else askText();
  });
})();
