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

export function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
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

/** @deprecated Use subscribeInstallPrompt for a single shared listener. */
export function listenForInstallPrompt(onAvailable: (prompt: BeforeInstallPromptEvent) => void) {
  return subscribeInstallPrompt(onAvailable);
}

export function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
