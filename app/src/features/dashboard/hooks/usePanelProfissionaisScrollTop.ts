import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function isProfissionaisPath(pathname: string) {
  return pathname === "/app/profissionais" || pathname.startsWith("/app/profissionais/");
}

/** Ao abrir Profissionais (KeepAlive), volta ao topo em vez de manter scroll em Bloqueios. */
export function usePanelProfissionaisScrollTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (isProfissionaisPath(pathname)) {
      document.querySelector("main")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    }
  }, [pathname]);
}
