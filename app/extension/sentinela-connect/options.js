const DEFAULTS = {
  apiBaseUrl: "https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/extension-connect",
  token: "",
  debug: false,
};

const fields = ["apiBaseUrl", "token"];

function setStatus(text, kind) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = kind || "";
}

async function readStoredConfig() {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get([...fields, "debug"]),
    chrome.storage.sync.get([...fields, "debug"]),
  ]);
  return { ...DEFAULTS, ...sync, ...local };
}

async function writeStoredConfig(payload) {
  await Promise.all([chrome.storage.local.set(payload), chrome.storage.sync.set(payload)]);
}

async function load() {
  const stored = await readStoredConfig();
  for (const key of fields) {
    document.getElementById(key).value = stored[key] ?? DEFAULTS[key];
  }
  document.getElementById("debug").checked = Boolean(stored.debug);

  if (stored.token?.trim()) {
    setStatus("Token já configurado neste navegador. Use Testar conexão para validar.", "ok");
  } else {
    setStatus("Nenhum token salvo ainda. Cole o sc_live_… e clique em Salvar.", "");
  }
}

async function save() {
  const stored = await readStoredConfig();
  const payload = {};
  for (const key of fields) {
    payload[key] = document.getElementById(key).value.trim();
  }
  if (!payload.token && stored.token?.trim()) {
    payload.token = stored.token.trim();
  }
  payload.debug = document.getElementById("debug").checked;
  await writeStoredConfig(payload);
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
    if (response?.error === "configure_token") {
      setStatus("Token vazio. Cole o sc_live_… gerado na aba Connect e clique em Salvar.", "err");
      return;
    }
    setStatus(response?.message || response?.error || "Falha na conexão.", "err");
  });
});

load();
