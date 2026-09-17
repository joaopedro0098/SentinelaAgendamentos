export function shouldIgnoreAgendamentoCardClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-agendamento-no-card-click]"));
}
