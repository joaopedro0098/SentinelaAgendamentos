import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PwaInstallHelpDialog, type PwaInstallHelpVariant } from "@/components/pwa/PwaInstallHelpDialog";
import {
  clearCachedInstallPrompt,
  getCachedInstallPrompt,
  isIosDevice,
  isSocialInAppBrowser,
  isStandalonePwa,
  subscribeInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaInstall";

function resolveHelpVariant(pathname: string): PwaInstallHelpVariant {
  return pathname.startsWith("/app") ? "app" : "landing";
}

type PwaInstallContextValue = {
  installed: boolean;
  showInstall: boolean;
  isIos: boolean;
  hasNativePrompt: boolean;
  tryNativeInstall: () => Promise<boolean>;
  openInstallHelp: (variant: PwaInstallHelpVariant, onAfterClose?: () => void) => void;
  closeInstallHelp: () => void;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" ? isStandalonePwa() : false,
  );
  const [hasNativePrompt, setHasNativePrompt] = useState(
    () => typeof window !== "undefined" && getCachedInstallPrompt() !== null,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpVariant, setHelpVariant] = useState<PwaInstallHelpVariant>("app");
  const afterHelpCloseRef = useRef<(() => void) | undefined>(undefined);
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
    const choice = await prompt.userChoice;
    clearCachedInstallPrompt();
    setHasNativePrompt(false);
    if (choice.outcome === "accepted") {
      setInstalled(isStandalonePwa());
      return true;
    }
    return false;
  }, []);

  const closeInstallHelp = useCallback(() => {
    setHelpOpen(false);
    const onAfterClose = afterHelpCloseRef.current;
    afterHelpCloseRef.current = undefined;
    onAfterClose?.();
  }, []);

  const openInstallHelp = useCallback((variant: PwaInstallHelpVariant, onAfterClose?: () => void) => {
    afterHelpCloseRef.current = onAfterClose;
    setHelpVariant(variant);
    window.setTimeout(() => setHelpOpen(true), 0);
  }, []);

  useEffect(() => {
    if (installed) return;
    if (!isSocialInAppBrowser()) return;

    const variant = resolveHelpVariant(window.location.pathname);
    const timer = window.setTimeout(() => openInstallHelp(variant), 0);
    return () => window.clearTimeout(timer);
  }, [installed, openInstallHelp]);

  const value = useMemo(
    () => ({
      installed,
      showInstall: !installed,
      isIos,
      hasNativePrompt,
      tryNativeInstall,
      openInstallHelp,
      closeInstallHelp,
    }),
    [closeInstallHelp, hasNativePrompt, installed, isIos, openInstallHelp, tryNativeInstall],
  );

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      <PwaInstallHelpDialog
        open={helpOpen}
        variant={helpVariant}
        isIos={isIos}
        onClose={closeInstallHelp}
      />
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstallContext() {
  const context = useContext(PwaInstallContext);
  if (!context) {
    throw new Error("usePwaInstallContext must be used within PwaInstallProvider");
  }
  return context;
}
