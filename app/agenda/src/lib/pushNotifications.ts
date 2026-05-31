import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as NavigatorWithStandalone).standalone === true;
}

/** Android: captura o prompt nativo de instalação. iOS não dispara esse evento. */
export function listenForInstallPrompt(onAvailable: (prompt: BeforeInstallPromptEvent) => void) {
  const handler = (event: Event) => {
    event.preventDefault();
    onAvailable(event as BeforeInstallPromptEvent);
  };
  window.addEventListener("beforeinstallprompt", handler);
  return () => window.removeEventListener("beforeinstallprompt", handler);
}

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function supportsWebPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function registerAppointmentPush(agendamentoId: string) {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, message: "Lembretes push ainda não foram configurados." };
  }

  if (!supportsWebPush()) {
    return { ok: false, message: "Este navegador não suporta notificações push." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Permissão de notificação não concedida." };
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
  const { error } = await supabase.functions.invoke("save-push-subscription", {
    body: {
      agendamento_id: agendamentoId,
      endpoint: payload.endpoint,
      keys: payload.keys,
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Lembrete ativado." };
}
