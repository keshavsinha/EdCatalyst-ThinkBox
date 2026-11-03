const $ = (id) => document.getElementById(id);
let state = { keys: {}, models: {}, lists: {}, mode: "practice", active: null };
let selected = "groq";

// ---------- live model lists (helpers in providers.js) ----------
const fetchModels = ecFetchModels;
const bestModel = ecBestModel;

function currentList(p) { return state.lists[p] && state.lists[p].length ? state.lists[p] : EC_PROVIDERS[p].models; }

async function loadModels(p, key, quiet) {
  const btn = $("loadModels");
  btn.disabled = true; btn.textContent = "Loading…";
  try {
    const list = await fetchModels(p, key);
    state.lists[p] = list;
    if (!list.some((m) => m.id === state.models[p])) state.models[p] = bestModel(p, list);
    await chrome.storage.local.set({ lists: state.lists, models: state.models });
    if (!quiet) msg(`✓ ${list.length} models loaded. Picked: ${state.models[p]}`, "ok");
    return true;
  } catch (e) {
    msg("Couldn't load models: " + e.message, "err");
    return false;
  } finally {
    btn.disabled = false; btn.textContent = "↻ Load models";
    render();
  }
}

// ---------- UI ----------
function maskStatus() {
  const p = state.active, st = $("status");
  if (p && state.keys[p]) {
    const info = EC_PROVIDERS[p];
    const m = currentList(p).find((x) => x.id === state.models[p]);
    const caps = !m || m.vision ? "Screenshot + Text ✓" : "Screenshot via OCR + Text ✓";
    $("statusText").textContent = `${info.label} (${p === "groq" ? "Free — " : ""}${caps}) — active ✓`;
    st.classList.add("on");
  } else {
    $("statusText").textContent = "Not activated — add an API key";
    st.classList.remove("on");
  }
}

function render() {
  document.querySelectorAll("#providers button").forEach((b) => b.classList.toggle("sel", b.dataset.p === selected));
  const info = EC_PROVIDERS[selected], list = currentList(selected);
  $("model").innerHTML = list.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  $("model").value = state.models[selected] && list.some((m) => m.id === state.models[selected]) ? state.models[selected] : list[0].id;
  $("key").value = state.keys[selected] || "";
  $("badge").classList.toggle("on", !!state.keys[selected] && state.active === selected);
  $("keyLink").textContent = info.keyHint;
  $("keyLink").href = info.keyUrl;
  $("keyNote").textContent = info.note;
  maskStatus();
}

function msg(text, kind) { $("msg").textContent = text; $("msg").className = "msg " + (kind || ""); }

async function load() {
  const s = await chrome.storage.local.get(["provider", "keys", "models", "lists", "mode"]);
  state.keys = s.keys || {};
  state.models = s.models || {};
  state.lists = s.lists || {};
  state.mode = EC_MODES[s.mode] ? s.mode : EC_DEFAULT_MODE;
  state.active = s.provider && state.keys[s.provider] ? s.provider : null;
  selected = s.provider || "groq";
  $("mode").innerHTML = Object.entries(EC_MODES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  $("mode").value = state.mode;
  $("verify").checked = (await chrome.storage.local.get("verify")).verify !== false;
  render();
}

document.querySelectorAll("#providers button").forEach((b) =>
  b.addEventListener("click", () => { selected = b.dataset.p; msg(""); render(); })
);

$("eye").onclick = () => { $("key").type = $("key").type === "password" ? "text" : "password"; };

$("model").onchange = async () => {
  state.models[selected] = $("model").value;
  await chrome.storage.local.set({ models: state.models });
  maskStatus();
};

$("verify").onchange = () => chrome.storage.local.set({ verify: $("verify").checked });

$("mode").onchange = async () => {
  state.mode = $("mode").value;
  await chrome.storage.local.set({ mode: state.mode });
};

$("loadModels").onclick = () => {
  const key = $("key").value.trim() || state.keys[selected];
  if (!key) return msg("Paste your API key first, then load models.", "err");
  loadModels(selected, key);
};

function test() {
  return new Promise((resolve) => chrome.runtime.sendMessage({ type: "test-key" }, resolve));
}

$("save").onclick = async () => {
  const key = $("key").value.trim();
  if (!key) return msg("Paste your " + EC_PROVIDERS[selected].label + " API key first.", "err");
  $("save").disabled = true;
  state.keys[selected] = key;
  state.models[selected] = $("model").value;
  state.mode = $("mode").value;
  await chrome.storage.local.set({ provider: selected, keys: state.keys, models: state.models, mode: state.mode });
  state.active = selected;
  render();

  // First save for this provider → fetch the live model list so we never use a retired model
  if (!state.lists[selected]) { msg("Saved. Loading your models…"); await loadModels(selected, key, true); }

  msg("Checking key…");
  let res = await test();
  if (res && !res.ok && /model|not exist|not found|decommission|access/i.test(res.error)) {
    msg("Model unavailable — reloading model list…");
    if (await loadModels(selected, key, true)) res = await test();
  }
  $("save").disabled = false;
  const fresh = await chrome.storage.local.get(["models", "lists"]); // background may have switched model
  state.models = fresh.models || state.models; state.lists = fresh.lists || state.lists; render();
  if (res && res.ok) msg(`✓ Key works — ${EC_PROVIDERS[selected].label} active (${state.models[selected]}).`, "ok");
  else msg("Saved, but the test failed: " + (res ? res.error : "no response"), "err");
};

$("reset").onclick = async () => {
  delete state.keys[selected];
  delete state.lists[selected];
  if (state.active === selected) state.active = null;
  await chrome.storage.local.set({ keys: state.keys, lists: state.lists });
  render();
  msg(EC_PROVIDERS[selected].label + " key removed.", "ok");
};

load();
