import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function isSettingsPath(pathname: string) {
  return pathname === "/app/settings" || pathname.startsWith("/app/settings/");
}

/** Ao abrir Configurações (KeepAlive), volta ao topo em vez de manter scroll em Bloqueios. */
export function usePanelSettingsScrollTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (isSettingsPath(pathname)) {
      document.querySelector("main")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    }
  }, [pathname]);
}
