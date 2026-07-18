const EXTENSION_RELOAD_MESSAGE =
  "A extensão foi atualizada. Recarregue esta aba do WhatsApp (F5) e tente de novo.";

function isExtensionContextValid() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function isExtensionContextInvalidatedError(message) {
  return /extension context invalidated/i.test(String(message ?? ""));
}

function sendExtensionMessage(message, callback) {
  if (!isExtensionContextValid()) {
    callback?.({
      ok: false,
      error: "extension_reloaded",
      message: EXTENSION_RELOAD_MESSAGE,
    });
    return;
  }

  try {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError?.message) {
        if (isExtensionContextInvalidatedError(lastError.message)) {
          callback?.({
            ok: false,
            error: "extension_reloaded",
            message: EXTENSION_RELOAD_MESSAGE,
          });
          return;
        }
        callback?.({ ok: false, error: "runtime_error", message: lastError.message });
        return;
      }
      callback?.(response);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    callback?.({
      ok: false,
      error: isExtensionContextInvalidatedError(message) ? "extension_reloaded" : "runtime_error",
      message: isExtensionContextInvalidatedError(message) ? EXTENSION_RELOAD_MESSAGE : message,
    });
  }
}

function sendExtensionMessageFireAndForget(message) {
  sendExtensionMessage(message, () => {});
}

function openExtensionOptionsPage() {
  if (!isExtensionContextValid()) return false;
  try {
    chrome.runtime.openOptionsPage();
    return true;
  } catch {
    return false;
  }
}

function getExtensionResourceUrl(path) {
  if (!isExtensionContextValid()) return null;
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return null;
  }
}

/** Validação compartilhada — rejeita @lid (ex.: 51582825697357) e aceita WhatsApp BR. */
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
