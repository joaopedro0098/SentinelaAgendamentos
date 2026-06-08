import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
const CLIENT_STORAGE_KEY = "agendabarber:cliente";

export function supportsClientConfirmationPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function getStoredClientWhatsapp(): string | null {
  try {
    const raw = localStorage.getItem(CLIENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { whatsapp?: string };
    const digits = String(parsed.whatsapp ?? "").replace(/\D/g, "");
    return digits.length >= 10 ? digits : null;
  } catch {
    return null;
  }
}

function isBrowserPushSubscriptionValid(subscription: PushSubscription | null) {
  if (!subscription) return false;

  try {
    const json = subscription.toJSON();
    return Boolean(
      json.endpoint?.trim() && json.keys?.p256dh?.trim() && json.keys?.auth?.trim(),
    );
  } catch {
    return false;
  }
}

async function unsubscribeBrowserPushSubscription(subscription: PushSubscription | null) {
  if (!subscription) return;
  try {
    await subscription.unsubscribe();
  } catch {
    // subscription já removida ou inacessível
  }
}

async function ensureBrowserPushSubscription(options?: {
  forceNew?: boolean;
  requestPermission?: boolean;
}) {
  if (!VAPID_PUBLIC_KEY || !supportsClientConfirmationPush()) return null;

  let permission = Notification.permission;
  if (permission === "default" && options?.requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register("/sw.js");
  let existing = await registration.pushManager.getSubscription();

  const needsNew = options?.forceNew || !isBrowserPushSubscriptionValid(existing);
  if (needsNew) {
    await unsubscribeBrowserPushSubscription(existing);
    existing = null;
  }

  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

/** Permissão concedida neste dispositivo (inscrição push é feita ao agendar). */
export function isClientConfirmationPushEnabled() {
  return supportsClientConfirmationPush() && Notification.permission === "granted";
}

/** Ativa push localmente (permissão + inscrição no navegador). */
export async function registerClientConfirmationPushLocal(options?: { requestPermission?: boolean }) {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false as const, message: "Notificações push ainda não foram configuradas." };
  }

  if (!supportsClientConfirmationPush()) {
    return { ok: false as const, message: "Este navegador não suporta notificações push." };
  }

  let permission = Notification.permission;
  if (permission === "default" && options?.requestPermission !== false) {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { ok: false as const, message: "Permissão de notificação não concedida." };
  }

  await ensureBrowserPushSubscription();
  return { ok: true as const, message: "Você receberá um aviso no dia anterior ao horário." };
}

/**
 * Ativa push no hub público: permissão local + sincroniza subscription do browser
 * com o servidor quando houver agendamento elegível para lembrete.
 */
export async function registerClientConfirmationPushFromHub(params: {
  slug: string;
  requestPermission?: boolean;
}) {
  const localResult = await registerClientConfirmationPushLocal({
    requestPermission: params.requestPermission,
  });
  if (!localResult.ok) return localResult;

  const whatsapp = getStoredClientWhatsapp();
  if (!whatsapp) return localResult;

  const { data, error } = await supabase.rpc("get_client_confirmation_push_status", {
    _slug: params.slug,
    _whatsapp: whatsapp,
  });

  if (error) {
    console.error("get_client_confirmation_push_status:", error.message);
    return localResult;
  }

  const status = (data ?? [])[0] as
    | { confirmation_token?: string; needs_resubscribe?: boolean }
    | undefined;

  if (!status?.confirmation_token) {
    return localResult;
  }

  const saveResult = await saveClientConfirmationPushSubscription({
    confirmationToken: status.confirmation_token,
    forceNewSubscription: Boolean(status.needs_resubscribe),
    ensureValidBrowserSubscription: true,
  });

  if (!saveResult.ok) {
    return {
      ok: false as const,
      message:
        saveResult.reason === "denied"
          ? "Permissão de notificação não concedida."
          : "Não foi possível atualizar a inscrição push. Tente novamente.",
    };
  }

  return {
    ok: true as const,
    message: status.needs_resubscribe
      ? "Inscrição de lembrete atualizada. Você receberá o aviso no dia anterior ao horário."
      : localResult.message,
  };
}

export async function unregisterClientConfirmationPushLocal() {
  if (!supportsClientConfirmationPush()) return;
  const registration = await navigator.serviceWorker.register("/sw.js");
  await (await registration.pushManager.getSubscription())?.unsubscribe();
}

/** Chamar no clique do botão Confirmar, antes de awaits longos (gesto do usuário). */
export async function requestClientNotificationPermission() {
  if (!supportsClientConfirmationPush()) return Notification.permission;
  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }
  return Notification.permission;
}

/** Inscreve push para receber confirmação no dia anterior (~10h). Não envia na hora. */
export async function saveClientConfirmationPushSubscription(params: {
  confirmationToken: string;
  forceNewSubscription?: boolean;
  /** Ao confirmar agendamento: valida subscription do browser e renova se inválida. */
  ensureValidBrowserSubscription?: boolean;
}) {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false as const, reason: "vapid_missing" as const };
  }

  if (!supportsClientConfirmationPush()) {
    return { ok: false as const, reason: "unsupported" as const };
  }

  const ensureValid = params.ensureValidBrowserSubscription ?? false;
  const requestPermission = ensureValid && Notification.permission === "default";

  if (ensureValid && Notification.permission === "denied") {
    return { ok: false as const, reason: "denied" as const };
  }

  if (!ensureValid && Notification.permission !== "granted") {
    return { ok: false as const, reason: "denied" as const };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  const browserSubscriptionInvalid =
    ensureValid && !params.forceNewSubscription && !isBrowserPushSubscriptionValid(existing);

  if (browserSubscriptionInvalid && Notification.permission === "denied") {
    return { ok: false as const, reason: "denied" as const };
  }

  const subscription = await ensureBrowserPushSubscription({
    forceNew: params.forceNewSubscription,
    requestPermission,
  });

  if (!subscription || !isBrowserPushSubscriptionValid(subscription)) {
    return { ok: false as const, reason: "subscription_invalid" as const };
  }

  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    return { ok: false as const, reason: "subscription_invalid" as const };
  }

  const { data, error } = await supabase.functions.invoke("client-confirmation-push", {
    body: {
      confirmation_token: params.confirmationToken,
      endpoint: payload.endpoint,
      keys: payload.keys,
    },
  });

  if (error) {
    return { ok: false as const, reason: "send_failed" as const, message: error.message };
  }

  const body = data as { ok?: boolean; subscribed?: boolean; error?: string; skipped?: boolean } | null;
  if (body?.error) {
    return { ok: false as const, reason: "send_failed" as const, message: body.error };
  }

  if (body?.skipped) {
    return { ok: false as const, reason: "skipped" as const };
  }

  if (!body?.subscribed) {
    return { ok: false as const, reason: "save_failed" as const };
  }

  return { ok: true as const, subscribed: true as const };
}
