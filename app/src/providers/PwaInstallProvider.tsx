import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearCachedInstallPrompt,
  getCachedInstallPrompt,
  isIosDevice,
  isStandalonePwa,
  subscribeInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaInstall";

type PwaInstallContextValue = {
  installed: boolean;
  showInstall: boolean;
  isIos: boolean;
  hasNativePrompt: boolean;
  tryNativeInstall: () => Promise<boolean>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" ? isStandalonePwa() : false,
  );
  const [hasNativePrompt, setHasNativePrompt] = useState(
    () => typeof window !== "undefined" && getCachedInstallPrompt() !== null,
  );
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

    return subscribeInstallPrompt((event: BeforeInstallPromptEvent) => {
      setHasNativePrompt(Boolean(event));
    });
  }, [installed]);

  const tryNativeInstall = useCallback(async () => {
    const prompt = getCachedInstallPrompt();
    if (!prompt) {
      setHasNativePrompt(false);
      return false;
    }

    await prompt.prompt();
    await prompt.userChoice;
    clearCachedInstallPrompt();
    setHasNativePrompt(false);
    setInstalled(isStandalonePwa());
    return true;
  }, []);

  const value = useMemo(
    () => ({
      installed,
      showInstall: !installed,
      isIos,
      hasNativePrompt,
      tryNativeInstall,
    }),
    [hasNativePrompt, installed, isIos, tryNativeInstall],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstallContext() {
  const context = useContext(PwaInstallContext);
  if (!context) {
    throw new Error("usePwaInstallContext must be used within PwaInstallProvider");
  }
  return context;
}
