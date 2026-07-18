const PANEL_SOURCE = "sentinela-connect-panel";
const EXT_SOURCE = "sentinela-connect-extension";

async function saveConfig({ token, apiBaseUrl, appBaseUrl }) {
  await chrome.storage.sync.set({
    token: String(token ?? "").trim(),
    apiBaseUrl: String(apiBaseUrl ?? "").trim(),
    appBaseUrl: String(appBaseUrl ?? "").trim(),
  });
}

function pingBackground() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "PING" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, message: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false, message: "Sem resposta da extensão." });
    });
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== PANEL_SOURCE) return;

  (async () => {
    if (data.type === "CHECK_INSTALLED") {
      window.postMessage(
        {
          source: EXT_SOURCE,
          type: "INSTALLED",
          requestId: data.requestId,
          installed: true,
        },
        "*",
      );
      return;
    }

    if (data.type === "CONFIGURE") {
      try {
        await saveConfig(data);
        const ping = await pingBackground();
        window.postMessage(
          {
            source: EXT_SOURCE,
            type: "CONFIGURE_RESULT",
            requestId: data.requestId,
            ok: true,
            pingOk: Boolean(ping?.ok),
            message: ping?.ok ? "Conexão OK — token válido." : ping?.message || "Token salvo, mas o teste falhou.",
          },
          "*",
        );
      } catch (error) {
        window.postMessage(
          {
            source: EXT_SOURCE,
            type: "CONFIGURE_RESULT",
            requestId: data.requestId,
            ok: false,
            message: error instanceof Error ? error.message : "Falha ao salvar configuração.",
          },
          "*",
        );
      }
    }
  })();
});
