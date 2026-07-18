const PANEL_SOURCE = "sentinela-connect-panel";
const EXT_SOURCE = "sentinela-connect-extension";

function extensionAvailable() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

function postConfigureResult(requestId, payload) {
  window.postMessage(
    {
      source: EXT_SOURCE,
      type: "CONFIGURE_RESULT",
      requestId,
      ...payload,
    },
    "*",
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== PANEL_SOURCE) return;

  if (data.type === "CHECK_INSTALLED") {
    window.postMessage(
      {
        source: EXT_SOURCE,
        type: "INSTALLED",
        requestId: data.requestId,
        installed: extensionAvailable(),
      },
      "*",
    );
    return;
  }

  if (data.type === "CONFIGURE") {
    if (!extensionAvailable()) {
      postConfigureResult(data.requestId, {
        ok: false,
        message: "Extensão Sentinela Connect não está ativa nesta aba.",
      });
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "CONFIGURE",
        token: data.token,
        apiBaseUrl: data.apiBaseUrl,
        supabaseUrl: data.supabaseUrl,
        supabasePublishableKey: data.supabasePublishableKey,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          postConfigureResult(data.requestId, {
            ok: false,
            message: chrome.runtime.lastError.message,
          });
          return;
        }
        postConfigureResult(data.requestId, response ?? { ok: false, message: "Sem resposta da extensão." });
      },
    );
  }
});
