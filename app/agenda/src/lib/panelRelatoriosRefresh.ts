export const PANEL_RELATORIOS_CHANGED = "sentinela:panel-relatorios-changed";

export function notifyPanelRelatoriosChanged() {
  window.dispatchEvent(new CustomEvent(PANEL_RELATORIOS_CHANGED));
}
