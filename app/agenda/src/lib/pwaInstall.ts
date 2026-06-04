type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

export function listenForInstallPrompt(onAvailable: (prompt: BeforeInstallPromptEvent) => void) {
  const handler = (event: Event) => {
    event.preventDefault();
    onAvailable(event as BeforeInstallPromptEvent);
  };
  window.addEventListener("beforeinstallprompt", handler);
  return () => window.removeEventListener("beforeinstallprompt", handler);
}
