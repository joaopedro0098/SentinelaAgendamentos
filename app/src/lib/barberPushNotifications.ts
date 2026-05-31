import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

export function supportsWebPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function registerBarberPush(options?: { requestPermission?: boolean }) {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false as const, message: "Notificações push ainda não foram configuradas." };
  }

  if (!supportsWebPush()) {
    return { ok: false as const, message: "Este navegador não suporta notificações push." };
  }

  let permission = Notification.permission;
  if (permission === "default" && options?.requestPermission) {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { ok: false as const, message: "Permissão de notificação não concedida." };
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
  const { error } = await supabase.functions.invoke("save-barber-push-subscription", {
    body: {
      endpoint: payload.endpoint,
      keys: payload.keys,
    },
  });

  if (error) {
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, message: "Notificações de novos agendamentos ativadas." };
}

export function isBarberPushEnabled() {
  return supportsWebPush() && Notification.permission === "granted";
}

export function barberPushStatusLabel() {
  if (!supportsWebPush()) return "Navegador sem suporte a push";
  if (Notification.permission === "granted") return "Ativadas neste dispositivo";
  if (Notification.permission === "denied") return "Bloqueadas nas configurações do navegador";
  return "Desativadas";
}
