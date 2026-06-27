export const PANEL_PACIENTES_CHANGED = "sentinela:panel-pacientes-changed";

export function notifyPanelPacientesChanged() {
  window.dispatchEvent(new CustomEvent(PANEL_PACIENTES_CHANGED));
}
