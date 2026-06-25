import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  PANEL_AGENDAMENTOS_CHANGED,
  type PanelAgendamentosChangedDetail,
} from "@agenda/lib/panelAgendamentosRefresh";

function isAgendamentosPath(pathname: string) {
  return pathname === "/app/agendamentos" || pathname.startsWith("/app/agendamentos/");
}

/** Recarrega a lista ao voltar para Agendamentos (KeepAlive) ou ao criar/alterar agendamento no painel. */
export function usePanelAgendamentosRefresh(
  onRefresh: (detail?: PanelAgendamentosChangedDetail) => void,
) {
  const { pathname } = useLocation();
  const wasInactiveRef = useRef(false);

  useEffect(() => {
    const isActive = isAgendamentosPath(pathname);
    if (isActive && wasInactiveRef.current) {
      onRefresh();
    }
    wasInactiveRef.current = !isActive;
  }, [pathname, onRefresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PanelAgendamentosChangedDetail>).detail;
      onRefresh(detail);
    };
    window.addEventListener(PANEL_AGENDAMENTOS_CHANGED, handler);
    return () => window.removeEventListener(PANEL_AGENDAMENTOS_CHANGED, handler);
  }, [onRefresh]);
}
