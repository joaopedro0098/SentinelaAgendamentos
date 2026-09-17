import { hasAgendamentoObservacao } from "@/features/dashboard/components/agendamentos/AgendamentoObsIndicator";
import { isAgendamentoObservacaoVista } from "@/features/dashboard/lib/agendamentoObservacaoVista";
import type { AgendamentoPainelItem } from "@/features/dashboard/lib/agendamentosPanel";

export function agendamentoHasObservacaoNaoVista(item: Pick<AgendamentoPainelItem, "id" | "observacao">): boolean {
  return hasAgendamentoObservacao(item.observacao) && !isAgendamentoObservacaoVista(item.id);
}

export function agendamentoShowNotificationDot(
  item: Pick<AgendamentoPainelItem, "id" | "observacao" | "has_pending_alert">,
): boolean {
  return Boolean(item.has_pending_alert) || agendamentoHasObservacaoNaoVista(item);
}

export function agendamentoCardOpensDetail(
  item: Pick<AgendamentoPainelItem, "id" | "observacao" | "has_pending_alert" | "has_any_alert">,
): boolean {
  return Boolean(item.has_any_alert) || hasAgendamentoObservacao(item.observacao);
}
