import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { PANEL_PACIENTES_CHANGED } from "@agenda/lib/panelPacientesRefresh";

function isPacientesPath(pathname: string) {
  return pathname === "/app/pacientes" || pathname.startsWith("/app/pacientes/");
}

/** Recarrega Pacientes ao voltar para a aba (KeepAlive) ou após salvar anotação. */
export function usePanelPacientesRefresh(onRefresh: () => void) {
  const { pathname } = useLocation();
  const wasInactiveRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const isActive = isPacientesPath(pathname);
    if (isActive && wasInactiveRef.current) {
      onRefreshRef.current();
    }
    wasInactiveRef.current = !isActive;
  }, [pathname]);

  useEffect(() => {
    const handler = () => onRefreshRef.current();
    window.addEventListener(PANEL_PACIENTES_CHANGED, handler);
    return () => window.removeEventListener(PANEL_PACIENTES_CHANGED, handler);
  }, []);
}
