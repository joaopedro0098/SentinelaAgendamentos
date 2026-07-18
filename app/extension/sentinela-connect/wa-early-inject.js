/**
 * Injeta wa-js o mais cedo possível (document_start).
 * Se entrar só no document_idle, o webpack do WhatsApp já carregou e o wa-js falha.
 */
(function () {
  if (globalThis.__scWaEarlyInjectStarted) return;
  globalThis.__scWaEarlyInjectStarted = true;

  function extensionOk() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function injectScript(relativePath, marker) {
    if (!extensionOk()) return;
    if (marker && document.querySelector(`script[data-${marker}="1"]`)) return;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(relativePath);
    if (marker) script.dataset[marker] = "1";
    const parent = document.documentElement || document.head || document.body;
    if (!parent) return;
    parent.appendChild(script);
  }

  function injectAll() {
    injectScript("wppconnect-wa.js", "sc-wa-js");
    injectScript("page-wa-store.js", "sc-wa-store");
  }

  if (document.documentElement) {
    injectAll();
    return;
  }

  document.addEventListener("DOMContentLoaded", injectAll, { once: true });
})();
