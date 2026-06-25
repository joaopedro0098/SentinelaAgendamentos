export const PANEL_AGENDAMENTOS_CHANGED = "sentinela:panel-agendamentos-changed";

export type PanelAgendamentosChangedDetail = {
  data?: string;
  barbeiroId?: string;
  agendamentoId?: string;
};

export function notifyPanelAgendamentosChanged(detail?: PanelAgendamentosChangedDetail) {
  window.dispatchEvent(new CustomEvent(PANEL_AGENDAMENTOS_CHANGED, { detail }));
}
