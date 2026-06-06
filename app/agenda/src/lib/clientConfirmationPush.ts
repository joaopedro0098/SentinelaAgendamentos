import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

export function supportsClientConfirmationPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
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

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  if (!existing) {
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  return { ok: true as const, message: "Você receberá um aviso no dia anterior ao horário." };
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
export async function saveClientConfirmationPushSubscription(params: { confirmationToken: string }) {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false as const, reason: "vapid_missing" as const };
  }

  if (!supportsClientConfirmationPush()) {
    return { ok: false as const, reason: "unsupported" as const };
  }

  if (Notification.permission !== "granted") {
    return { ok: false as const, reason: "denied" as const };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

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

  const body = data as { ok?: boolean; sent?: number; error?: string; skipped?: boolean } | null;
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
