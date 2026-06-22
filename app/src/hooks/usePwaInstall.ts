import { usePwaInstallContext } from "@/providers/PwaInstallProvider";

export function usePwaInstall() {
  const { showInstall, isIos, tryNativeInstall, openInstallHelp } = usePwaInstallContext();

  return {
    showInstall,
    isIos,
    tryNativeInstall,
    openInstallHelp,
  };
}
