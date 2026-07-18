(function () {
  const OUT = "sentinela-connect-wa-store";
  const IN = "sentinela-connect-wa-store-req";
  const SC_SCRIPT_BASE = document.currentScript?.src
    ? document.currentScript.src.replace(/[^/]+$/, "")
    : "";

  function isValidBrazilWhatsappDigits(digits) {
    if (!digits || digits.length < 10 || digits.length > 13) return false;
    if (digits.length >= 12 && digits.startsWith("55")) {
      const local = digits.slice(2);
      return local.length >= 10 && local.length <= 11;
    }
    return digits.length >= 10 && digits.length <= 11;
  }

  function normalizeBrazilWhatsappId(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!isValidBrazilWhatsappDigits(digits)) return null;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  function phoneFromWid(wid) {
    if (!wid) return null;
    if (typeof wid === "string") {
      if (wid.includes("@lid") || wid.includes("@g.us")) return null;
      const m = wid.match(/^(\d{10,13})@(?:c\.us|s\.whatsapp\.net)$/);
      return m ? normalizeBrazilWhatsappId(m[1]) : null;
    }
    const server = wid.server || "";
    if (server === "lid" || server === "g.us") return null;
    if (server === "c.us" || server === "s.whatsapp.net") {
      return normalizeBrazilWhatsappId(wid.user);
    }
    const serialized = wid._serialized || "";
    if (serialized.includes("@c.us") || serialized.includes("@s.whatsapp.net")) {
      return normalizeBrazilWhatsappId(serialized.split("@")[0]);
    }
    return null;
  }

  function waitWaJsReady(timeoutMs = 30000) {
    if (window.__scWaJsReadyPromise) return window.__scWaJsReadyPromise;

    window.__scWaJsReadyPromise = new Promise((resolve, reject) => {
      let settled = false;
      const finishOk = (WPP) => {
        if (settled) return;
        settled = true;
        resolve(WPP);
      };
      const finishErr = (message) => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };

      const waitUntilReady = (WPP) => {
        if (!WPP) {
          finishErr("wa_js_not_ready");
          return;
        }
        if (WPP.isReady || WPP.isFullReady) {
          finishOk(WPP);
          return;
        }
        if (WPP.webpack?.onFullReady) {
          WPP.webpack.onFullReady(() => finishOk(WPP));
          return;
        }
        if (typeof WPP.on === "function") {
          WPP.on("conn.main_ready", () => finishOk(WPP));
        }
        const started = Date.now();
        const poll = () => {
          if (WPP.isReady || WPP.isFullReady) {
            finishOk(WPP);
            return;
          }
          if (Date.now() - started >= timeoutMs) {
            finishErr("wa_js_timeout");
            return;
          }
          setTimeout(poll, 250);
        };
        poll();
      };

      if (window.WPP) {
        waitUntilReady(window.WPP);
        return;
      }

      const waJsUrl = SC_SCRIPT_BASE ? `${SC_SCRIPT_BASE}wppconnect-wa.js` : "";
      if (!waJsUrl) {
        finishErr("wa_js_script_base_missing");
        return;
      }

      let script = document.querySelector('script[data-sc-wa-js="1"]');
      if (!script) {
        script = document.createElement("script");
        script.src = waJsUrl;
        script.dataset.scWaJs = "1";
        script.onload = () => {
          if (window.WPP) {
            waitUntilReady(window.WPP);
            return;
          }
          const started = Date.now();
          const waitWpp = () => {
            if (window.WPP) {
              waitUntilReady(window.WPP);
              return;
            }
            if (Date.now() - started >= timeoutMs) {
              finishErr("wa_js_not_ready");
              return;
            }
            setTimeout(waitWpp, 100);
          };
          waitWpp();
        };
        script.onerror = () => finishErr("wa_js_load_failed");
        (document.documentElement || document.head || document.body).appendChild(script);
      } else {
        const started = Date.now();
        const waitExisting = () => {
          if (window.WPP) {
            waitUntilReady(window.WPP);
            return;
          }
          if (Date.now() - started >= timeoutMs) {
            finishErr("wa_js_not_ready");
            return;
          }
          setTimeout(waitExisting, 100);
        };
        if (script.complete || script.readyState === "complete") {
          waitExisting();
        } else {
          script.addEventListener("load", waitExisting, { once: true });
          script.addEventListener("error", () => finishErr("wa_js_load_failed"), { once: true });
        }
      }

      setTimeout(() => finishErr("wa_js_timeout"), timeoutMs);
    });

    return window.__scWaJsReadyPromise;
  }

  function chatSerializedId(chat) {
    return chat?.id?._serialized || String(chat?.id ?? "");
  }

  async function resolvePhoneFromWaJsChat(WPP, chat) {
    const serialized = chatSerializedId(chat);
    const server = chat?.id?.server || serialized.split("@")[1] || "";
    const isLid = server === "lid" || serialized.includes("@lid");

    let phone = null;
    if (!isLid) {
      phone = phoneFromWid(chat.id);
    }

    if (!phone && WPP.contact?.get) {
      try {
        const contact = await WPP.contact.get(chat.id);
        phone =
          phoneFromWid(contact?.phoneNumber) ||
          phoneFromWid(contact?.id) ||
          normalizeBrazilWhatsappId(contact?.userid) ||
          normalizeBrazilWhatsappId(contact?.formattedPhone) ||
          normalizeBrazilWhatsappId(
            typeof contact?.getFormattedPhoneNumber === "function"
              ? contact.getFormattedPhoneNumber()
              : null,
          );
      } catch (_) {}
    }

    if (!phone && isLid && WPP.contact?.getPnLidEntry) {
      try {
        const entry = await WPP.contact.getPnLidEntry(chat.id);
        phone =
          phoneFromWid(entry?.phoneNumber) ||
          phoneFromWid(entry?.pn) ||
          normalizeBrazilWhatsappId(entry?.phoneNumber);
      } catch (_) {}
    }

    return { phone, isLid, serialized, server };
  }

  async function readActiveChat() {
    const diag = {
      require: false,
      store: false,
      activeChat: false,
      serialized: "",
      server: "",
      reason: "unknown",
      engine: "",
    };

    try {
      const WPP = await waitWaJsReady();
      diag.engine = "wa-js";
      diag.require = true;
      diag.store = true;

      const chat = WPP.chat.getActiveChat();
      diag.activeChat = Boolean(chat?.id);
      if (!chat?.id) {
        diag.reason = "no_active_chat";
        return { chat: null, diag };
      }

      const { phone, isLid, serialized, server } = await resolvePhoneFromWaJsChat(WPP, chat);
      diag.serialized = serialized;
      diag.server = server;

      if (server === "g.us" || serialized.includes("@g.us")) {
        diag.reason = "group";
        return { chat: { kind: "group" }, diag };
      }

      if (phone) {
        diag.reason = "ok";
        return { chat: { kind: "individual", phone, via: "wa-store" }, diag };
      }

      if (isLid) {
        diag.reason = "lid_without_phone";
        return { chat: { kind: "lid" }, diag };
      }

      diag.reason = "saved_name_without_phone";
      return { chat: null, diag };
    } catch (error) {
      diag.engine = "wa-js";
      const msg = error instanceof Error ? error.message : "wa_js_unavailable";
      diag.reason =
        msg === "wa_js_timeout"
          ? "wa_js_timeout"
          : msg === "wa_js_load_failed"
            ? "wa_js_load_failed"
            : msg === "wa_js_not_ready"
              ? "wa_js_not_ready"
              : msg === "wa_js_script_base_missing"
                ? "wa_js_script_base_missing"
                : "wa_js_unavailable";
      return { chat: null, diag };
    }
  }

  if (window.__scWaStoreBridgeReady) return;
  window.__scWaStoreBridgeReady = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== IN) return;

    void (async () => {
      const result = await readActiveChat();
      window.postMessage(
        {
          source: OUT,
          requestId: event.data.requestId,
          chat: result.chat,
          diag: result.diag,
        },
        "*",
      );
    })();
  });
})();
