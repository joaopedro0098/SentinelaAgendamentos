(function () {
  const IN = "sentinela-connect-compose-insert-req";
  const OUT = "sentinela-connect-compose-insert-res";
  const SC_SCRIPT_BASE = document.currentScript?.src
    ? document.currentScript.src.replace(/[^/]+$/, "")
    : "";

  function waitWaJsReady(timeoutMs = 12000) {
    if (window.__scWaJsReadyPromise) return window.__scWaJsReadyPromise;

    window.__scWaJsReadyPromise = new Promise((resolve, reject) => {
      const finish = (WPP) => {
        if (WPP?.isFullReady) {
          resolve(WPP);
          return;
        }
        if (WPP?.webpack?.onFullReady) {
          WPP.webpack.onFullReady(() => resolve(WPP));
          return;
        }
        if (WPP?.isReady) {
          resolve(WPP);
          return;
        }
        reject(new Error("wa_js_not_ready"));
      };

      if (window.WPP) {
        finish(window.WPP);
        return;
      }

      const waJsUrl = SC_SCRIPT_BASE ? `${SC_SCRIPT_BASE}wppconnect-wa.js` : "";
      if (!waJsUrl) {
        reject(new Error("wa_js_script_base_missing"));
        return;
      }

      let script = document.querySelector('script[data-sc-wa-js="1"]');
      if (!script) {
        script = document.createElement("script");
        script.src = waJsUrl;
        script.dataset.scWaJs = "1";
        script.onload = () => finish(window.WPP);
        script.onerror = () => reject(new Error("wa_js_load_failed"));
        (document.head || document.documentElement).appendChild(script);
      } else if (window.WPP) {
        finish(window.WPP);
      } else {
        script.addEventListener("load", () => finish(window.WPP), { once: true });
      }

      setTimeout(() => reject(new Error("wa_js_timeout")), timeoutMs);
    });

    return window.__scWaJsReadyPromise;
  }

  function findComposeInput() {
    const selectors = [
      '#main footer div[contenteditable="true"][role="textbox"]',
      '#main footer div[contenteditable="true"]',
      '#main [contenteditable="true"][data-tab="10"]',
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.isContentEditable) return el;
    }
    return null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function lineToHtml(line) {
    return escapeHtml(line);
  }

  function templateToHtml(text) {
    return String(text)
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => (line ? lineToHtml(line) : ""))
      .join("<br>");
  }

  function templateToPlain(text) {
    return String(text).replace(/\r\n/g, "\n");
  }

  function composeText(input) {
    return (input.innerText || input.textContent || "").replace(/\u200b/g, "").trim();
  }

  function waitForComposeContent(input, timeoutMs) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (composeText(input).length > 0) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(false);
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  function clearCompose(input) {
    input.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
  }

  function pasteIntoCompose(input, text) {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", templateToPlain(text));
    dataTransfer.setData("text/html", `<meta charset="utf-8">${templateToHtml(text)}`);
    input.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      }),
    );
  }

  async function insertViaWaJs(text) {
    const WPP = await waitWaJsReady();
    const chat = WPP.chat.getActiveChat();
    if (!chat?.id) return false;

    const serialized = chat.id._serialized || String(chat.id);
    if (serialized.includes("@g.us")) return false;

    const plain = templateToPlain(text);
    await WPP.chat.setInputText(plain, chat.id);

    const contents =
      typeof chat.getComposeContents === "function" ? chat.getComposeContents() : null;
    const written = String(contents?.text ?? plain).replace(/\u200b/g, "").trim();
    return written.length > 0;
  }

  async function insertViaPasteFallback(text) {
    const input = findComposeInput();
    if (!input) return false;

    clearCompose(input);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    pasteIntoCompose(input, text);
    return waitForComposeContent(input, 800);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== IN) return;

    void (async () => {
      const { requestId, text } = event.data;
      const normalized = String(text ?? "");
      if (!normalized.trim()) {
        window.postMessage(
          { source: OUT, requestId, ok: false, message: "Mensagem vazia." },
          "*",
        );
        return;
      }

      let ok = false;
      try {
        ok = await insertViaWaJs(normalized);
      } catch (_) {
        ok = false;
      }

      if (!ok) {
        ok = await insertViaPasteFallback(normalized);
      }

      if (!ok) {
        window.postMessage(
          {
            source: OUT,
            requestId,
            ok: false,
            message: "Campo de mensagem não encontrado. Abra uma conversa individual.",
          },
          "*",
        );
        return;
      }

      window.postMessage(
        {
          source: OUT,
          requestId,
          ok: true,
          message: "",
        },
        "*",
      );
    })();
  });
})();
