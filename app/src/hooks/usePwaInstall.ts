import { useCallback, useState } from "react";
import { usePwaInstallContext } from "@/providers/PwaInstallProvider";

export function usePwaInstall() {
  const { showInstall, isIos, tryNativeInstall } = usePwaInstallContext();
  const [showHelp, setShowHelp] = useState(false);

  const handleInstall = useCallback(async () => {
    const installedViaPrompt = await tryNativeInstall();
    if (!installedViaPrompt) {
      setShowHelp(true);
    }
  }, [tryNativeInstall]);

  return {
    showInstall,
    isIos,
    showHelp,
    setShowHelp,
    handleInstall,
  };
}
