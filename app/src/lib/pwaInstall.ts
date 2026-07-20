type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let cachedInstallPrompt: BeforeInstallPromptEvent | null = null;
let listenerInitialized = false;
const installPromptSubscribers = new Set<(prompt: BeforeInstallPromptEvent) => void>();

function notifyInstallPromptSubscribers(prompt: BeforeInstallPromptEvent) {
  installPromptSubscribers.forEach((subscriber) => subscriber(prompt));
}

function initInstallPromptListener() {
  if (listenerInitialized || typeof window === "undefined") return;
  listenerInitialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    cachedInstallPrompt = event as BeforeInstallPromptEvent;
    notifyInstallPromptSubscribers(cachedInstallPrompt);
  });
}

/** Registra o listener o mais cedo possível (ex.: em main.tsx). */
export function initInstallPromptCapture() {
  initInstallPromptListener();
}

export function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isAndroidDevice() {
  return /android/i.test(window.navigator.userAgent);
}

export type BlockedNotificationGuidance = {
  title: string;
  description: string;
  hint: string;
};

/** Orientação quando Notification.permission === "denied" (SO ou navegador). */
export function getBlockedNotificationGuidance(): BlockedNotificationGuidance {
  if (isStandalonePwa()) {
    if (isIosDevice()) {
      return {
        title: "Notificações desativadas",
        description:
          "As permissões estão desabilitadas. Vá em Ajustes → Sentinela → Notificações, ative e volte ao app.",
        hint: "Ative em Ajustes → Sentinela → Notificações.",
      };
    }
    if (isAndroidDevice()) {
      return {
        title: "Notificações desativadas",
        description:
          "As permissões estão desabilitadas. Vá em Configurações → Aplicativos → Sentinela → Notificações, ative e volte ao app.",
        hint: "Ative em Configurações → Aplicativos → Sentinela.",
      };
    }
    return {
      title: "Notificações desativadas",
      description:
        "As permissões estão desabilitadas. Ative as notificações do Sentinela nas configurações do aparelho e volte ao app.",
      hint: "Notificações desativadas nas configurações do aparelho.",
    };
  }

  if (isIosDevice()) {
    return {
      title: "Notificações bloqueadas",
      description:
        "No Safari: Ajustes → Safari → Avançado → Dados dos sites → Sentinela → Notificações → Permitir. Depois recarregue a página.",
      hint: "Notificações bloqueadas no Safari.",
    };
  }

  if (isAndroidDevice()) {
    const browser = getSuggestedExternalBrowserLabel();
    return {
      title: "Notificações bloqueadas",
      description: `No ${browser}: toque no ícone ao lado da URL → Configurações do site → Notificações → Permitir. Depois recarregue a página.`,
      hint: "Notificações bloqueadas neste navegador.",
    };
  }

  const browser = getSuggestedExternalBrowserLabel();
  return {
    title: "Notificações bloqueadas",
    description: `No ${browser}: clique no cadeado ao lado da URL → Configurações do site → Notificações → Permitir. Depois recarregue a página.`,
    hint: "Notificações bloqueadas neste navegador.",
  };
}

export function isSocialInAppBrowser() {
  const ua = window.navigator.userAgent.toLowerCase();
  return (
    ua.includes("instagram") ||
    ua.includes("tiktok") ||
    ua.includes("musical_ly") ||
    ua.includes("bytedancewebview")
  );
}

export function getSocialInAppSourceLabel() {
  const ua = window.navigator.userAgent.toLowerCase();
  const fromInstagram = ua.includes("instagram");
  const fromTiktok =
    ua.includes("tiktok") || ua.includes("musical_ly") || ua.includes("bytedancewebview");

  if (fromInstagram && fromTiktok) return "Instagram ou TikTok";
  if (fromInstagram) return "Instagram";
  if (fromTiktok) return "TikTok";
  return "Instagram ou TikTok";
}

/** Nome do navegador externo mais provável (menu "Abrir no…" do Instagram/TikTok). */
export function getSuggestedExternalBrowserLabel() {
  const ua = window.navigator.userAgent;

  if (/iphone|ipad|ipod/i.test(ua)) {
    if (/crios/i.test(ua)) return "Chrome";
    if (/fxios/i.test(ua)) return "Firefox";
    if (/edgios/i.test(ua)) return "Edge";
    return "Safari";
  }

  if (/android/i.test(ua)) {
    if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
    if (/EdgA/i.test(ua)) return "Edge";
    if (/Firefox/i.test(ua)) return "Firefox";
    return "Chrome";
  }

  return "navegador";
}

export function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

const PWA_WINDOW_TITLE = "Sentinela";

/** Mantém título curto no app instalado (sem sufixo de página / URL na barra do sistema). */
export function applyPwaWindowTitle() {
  if (!isStandalonePwa()) return;
  if (document.title !== PWA_WINDOW_TITLE) {
    document.title = PWA_WINDOW_TITLE;
  }
}

export const BARBER_PWA_HOME = "/app/agendamentos";

const BARBER_PWA_MARKETING_PATHS = new Set([
  "/",
  "/planos",
  "/politica-de-privacidade",
  "/termos-de-servico",
  "/login",
  "/signup",
  "/signup/confirmar-codigo",
  "/verificacao-facial",
  "/recover",
]);

export function isBarberPwaMarketingPath(pathname: string) {
  return BARBER_PWA_MARKETING_PATHS.has(pathname);
}

/** Destino após login/cadastro do barbeiro (PWA instalado → Agendamentos). */
export function getBarberPostLoginPath(from?: { pathname?: string; search?: string } | null) {
  const pathname = from?.pathname?.trim();
  if (pathname?.startsWith("/app/")) {
    return `${pathname}${from?.search ?? ""}`;
  }
  return isStandalonePwa() ? BARBER_PWA_HOME : "/app/agendamentos";
}

export function getCachedInstallPrompt() {
  return cachedInstallPrompt;
}

export function clearCachedInstallPrompt() {
  cachedInstallPrompt = null;
}

export function subscribeInstallPrompt(onAvailable: (prompt: BeforeInstallPromptEvent) => void) {
  initInstallPromptListener();

  if (cachedInstallPrompt) {
    onAvailable(cachedInstallPrompt);
  }

  installPromptSubscribers.add(onAvailable);
  return () => installPromptSubscribers.delete(onAvailable);
}

export function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Em dev o SW cacheia bundles antigos e esconde mudanças (ex.: aba Pagamentos).
  if (import.meta.env.DEV) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => void reg.unregister());
    });
    return;
  }
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
}
