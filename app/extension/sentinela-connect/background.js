const DEFAULTS = {
  apiBaseUrl: "https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/extension-connect",
  appBaseUrl: "https://sentinelagendamentos.com",
  token: "",
  debug: false,
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

async function apiGet(pathAndQuery) {
  const settings = await getSettings();
  if (!settings.token?.trim()) {
    return { ok: false, error: "configure_token", message: "Configure o token nas opções da extensão." };
  }

  const url = `${settings.apiBaseUrl.replace(/\/+$/, "")}${pathAndQuery}`;
  const res = await fetch(url, { method: "GET", headers: authHeaders(settings.token.trim()) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || "request_failed",
      message: data.error || `Erro ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true, data, settings };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "PING") {
      const result = await apiGet("?action=ping");
      sendResponse(result);
      return;
    }
    if (message.type === "LOOKUP") {
      const phone = String(message.phone ?? "").replace(/\D/g, "");
      if (phone.length < 10) {
        sendResponse({ ok: false, error: "invalid_phone", message: "Telefone inválido." });
        return;
      }
      const result = await apiGet(`?phone=${encodeURIComponent(phone)}`);
      sendResponse(result);
      return;
    }
    if (message.type === "GET_SETTINGS") {
      sendResponse({ ok: true, settings: await getSettings() });
      return;
    }
    sendResponse({ ok: false, error: "unknown_message" });
  })();
  return true;
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
