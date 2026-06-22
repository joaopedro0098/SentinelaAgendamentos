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

export function isSocialInAppBrowser() {
  const ua = window.navigator.userAgent.toLowerCase();
  return (
    ua.includes("instagram") ||
    ua.includes("tiktok") ||
    ua.includes("musical_ly") ||
    ua.includes("bytedancewebview")
  );
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
  "/recover",
]);

export function isBarberPwaMarketingPath(pathname: string) {
  return BARBER_PWA_MARKETING_PATHS.has(pathname);
}

/** Destino após login/cadastro do barbeiro (PWA instalado → Agendamentos). */
export function getBarberPostLoginPath() {
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
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
}
