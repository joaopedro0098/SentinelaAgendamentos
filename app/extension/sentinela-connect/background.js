const DEFAULTS = {
  apiBaseUrl: "https://zdmecbyyfubpmwrzzbqf.supabase.co/functions/v1/extension-connect",
  token: "",
  debug: false,
  supabaseUrl: "",
  supabasePublishableKey: "",
};

const CONNECT_APPOINTMENT_BROADCAST_EVENT = "connect_appointment_updated";

// Mesma normalização usada no extension-connect e no painel do Sentinela:
// o canal do broadcast precisa do telefone em E.164 BR (55 + DDD + número)
// para os dois lados baterem, já que `cliente_whatsapp` costuma ser gravado
// sem o "55".
function normalizeBrazilWhatsappDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

let appointmentWatch = {
  phone: null,
  channel: null,
  supabase: null,
};

function deriveSupabaseUrl(apiBaseUrl) {
  return String(apiBaseUrl ?? "")
    .replace(/\/functions\/v1\/extension-connect.*$/i, "")
    .replace(/\/+$/, "");
}

async function getSupabaseClient() {
  const settings = await getSettings();
  const url = settings.supabaseUrl?.trim() || deriveSupabaseUrl(settings.apiBaseUrl);
  const key = settings.supabasePublishableKey?.trim();
  if (!url || !key) return null;
  try {
    // MV3 não permite import remoto no service worker; falha silenciosa aqui
    // mantém LOOKUP/PING ok e o refetch por visibilitychange no WhatsApp.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    return createClient(url, key);
  } catch (error) {
    console.warn(
      "[Sentinela Connect] Realtime indisponível no background:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function unwatchAppointments() {
  if (appointmentWatch.channel && appointmentWatch.supabase) {
    await appointmentWatch.supabase.removeChannel(appointmentWatch.channel);
  }
  appointmentWatch = { phone: null, channel: null, supabase: null };
}

function notifyWhatsAppTabs(payload) {
  chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  });
}

async function watchAppointments(phone) {
  const digits = normalizeBrazilWhatsappDigits(phone);
  if (digits.length < 10) {
    await unwatchAppointments();
    return;
  }
  if (appointmentWatch.phone === digits && appointmentWatch.channel) return;

  await unwatchAppointments();
  const supabase = await getSupabaseClient();
  if (!supabase) return;

  const channel = supabase.channel(`sentinela:connect-wa:${digits}`, {
    config: { broadcast: { self: true } },
  });
  channel.on("broadcast", { event: CONNECT_APPOINTMENT_BROADCAST_EVENT }, () => {
    notifyWhatsAppTabs({ type: "APPOINTMENT_UPDATED", phone: digits });
  });
  // Sem polling por intervalo: em vez disso, toda vez que este canal fica
  // "SUBSCRIBED" (na conexão inicial e em qualquer reconexão automática do
  // realtime após queda de rede/aba suspensa) forçamos um refetch único. Isso
  // cobre o caso de um broadcast ter sido perdido enquanto o WebSocket estava
  // desconectado, sem custo de requisições repetidas em regime normal.
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      notifyWhatsAppTabs({ type: "APPOINTMENT_UPDATED", phone: digits });
    }
  });
  appointmentWatch = { phone: digits, channel, supabase };
}

async function saveConnectConfig(payload) {
  const apiBaseUrl = String(payload.apiBaseUrl ?? "").trim() || DEFAULTS.apiBaseUrl;
  const data = {
    token: String(payload.token ?? "").trim(),
    apiBaseUrl,
    supabaseUrl: String(payload.supabaseUrl ?? "").trim() || deriveSupabaseUrl(apiBaseUrl),
    supabasePublishableKey: String(payload.supabasePublishableKey ?? "").trim(),
  };
  await Promise.all([chrome.storage.local.set(data), chrome.storage.sync.set(data)]);
}

async function getSettings() {
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(Object.keys(DEFAULTS)),
    chrome.storage.sync.get(Object.keys(DEFAULTS)),
  ]);
  return { ...DEFAULTS, ...sync, ...local };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
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

async function apiPost(body) {
  const settings = await getSettings();
  if (!settings.token?.trim()) {
    return { ok: false, error: "configure_token", message: "Configure o token nas opções da extensão." };
  }

  const url = `${settings.apiBaseUrl.replace(/\/+$/, "")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(settings.token.trim()),
    body: JSON.stringify(body),
  });
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

async function fetchAvatarDataUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed.startsWith("https://")) {
    return { ok: false, error: "invalid_url" };
  }
  try {
    const res = await fetch(trimmed);
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) {
      return { ok: false, error: "not_image" };
    }
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { ok: true, dataUrl: `data:${blob.type};base64,${btoa(binary)}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "fetch_failed" };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "PING") {
      const result = await apiGet("?action=ping");
      sendResponse(result);
      return;
    }
    if (message.type === "CONFIGURE") {
      try {
        await saveConnectConfig(message);
        sendResponse({
          ok: true,
          tokenSaved: true,
          message: "Token salvo na extensão.",
        });
        void apiGet("?action=ping").then((ping) => {
          if (!ping?.ok) {
            console.warn("[Sentinela Connect] Token salvo, ping falhou:", ping?.message || ping?.error);
          }
        });
      } catch (error) {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao salvar configuração.",
        });
      }
      return;
    }
    if (message.type === "LOOKUP") {
      const phone = String(message.phone ?? "").replace(/\D/g, "");
      const displayName = String(message.displayName ?? "").trim();
      if (phone.length < 10) {
        sendResponse({ ok: false, error: "invalid_phone", message: "Telefone inválido." });
        return;
      }
      const qs = new URLSearchParams({ phone });
      if (displayName) qs.set("display_name", displayName);
      const result = await apiGet(`?${qs.toString()}`);
      sendResponse(result);
      return;
    }
    if (message.type === "LIST_TEMPLATES") {
      const result = await apiGet("?action=templates");
      sendResponse(result);
      return;
    }
    if (message.type === "SAVE_TEMPLATE") {
      const result = await apiPost({
        action: "save_template",
        id: message.id || null,
        label: String(message.label ?? ""),
        body: String(message.body ?? ""),
      });
      sendResponse(result);
      return;
    }
    if (message.type === "DELETE_TEMPLATE") {
      const result = await apiPost({
        action: "delete_template",
        id: String(message.id ?? ""),
      });
      sendResponse(result);
      return;
    }
    if (message.type === "FETCH_AVATAR") {
      sendResponse(await fetchAvatarDataUrl(message.url));
      return;
    }
    if (message.type === "WATCH_APPOINTMENTS") {
      try {
        await watchAppointments(message.phone);
        sendResponse({ ok: true });
      } catch (error) {
        console.warn(
          "[Sentinela Connect] Falha ao observar agendamentos:",
          error instanceof Error ? error.message : error,
        );
        sendResponse({ ok: false, error: "watch_failed" });
      }
      return;
    }
    if (message.type === "UNWATCH_APPOINTMENTS") {
      await unwatchAppointments();
      sendResponse({ ok: true });
      return;
    }
    sendResponse({ ok: false, error: "unknown_message" });
  })();
  return true;
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
