import { useCallback, useEffect, useState } from "react";
import {
  isIosDevice,
  isStandalonePwa,
  listenForInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaInstall";

export function usePwaInstall() {
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" ? isStandalonePwa() : false,
  );
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const isIos = typeof window !== "undefined" && isIosDevice();

  useEffect(() => {
    setInstalled(isStandalonePwa());
    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayMode = () => setInstalled(isStandalonePwa());
    media.addEventListener("change", onDisplayMode);
    return () => media.removeEventListener("change", onDisplayMode);
  }, []);

  useEffect(() => {
    if (installed) return;
    return listenForInstallPrompt((event) => setInstallPrompt(event));
  }, [installed]);

  const handleInstall = useCallback(async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      setInstalled(isStandalonePwa());
      return;
    }
    setShowHelp(true);
  }, [installPrompt]);

  return {
    installed,
    showInstall: !installed,
    isIos,
    showHelp,
    setShowHelp,
    handleInstall,
  };
}
