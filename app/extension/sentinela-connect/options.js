const DEFAULTS = {
  apiBaseUrl: "https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/extension-connect",
  appBaseUrl: "https://sentinelagendamentos.com",
  token: "",
  debug: false,
};

const fields = ["apiBaseUrl", "appBaseUrl", "token"];

function setStatus(text, kind) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = kind || "";
}

async function load() {
  const stored = await chrome.storage.sync.get([...fields, "debug"]);
  for (const key of fields) {
    document.getElementById(key).value = stored[key] ?? DEFAULTS[key];
  }
  document.getElementById("debug").checked = Boolean(stored.debug);
}

async function save() {
  const payload = {};
  for (const key of fields) {
    payload[key] = document.getElementById(key).value.trim();
  }
  payload.debug = document.getElementById("debug").checked;
  await chrome.storage.sync.set(payload);
  setStatus("Configuração salva.", "ok");
}

document.getElementById("save").addEventListener("click", save);

document.getElementById("test").addEventListener("click", async () => {
  await save();
  setStatus("Testando…", "");
  chrome.runtime.sendMessage({ type: "PING" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (response?.ok) {
      setStatus("Conexão OK — token válido.", "ok");
      return;
    }
    setStatus(response?.message || "Falha na conexão.", "err");
  });
});

load();
