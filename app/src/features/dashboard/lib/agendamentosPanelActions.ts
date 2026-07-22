import { supabase } from "@agenda/integrations/supabase/client";
import type { AgendamentoPainelItem, PastDayStatusKey } from "@/features/dashboard/lib/agendamentosPanel";

export type PanelStatusUpdateRow = {
  status?: AgendamentoPainelItem["status"];
  client_confirmed_at?: string | null;
};

const SLOT_OCCUPIED_HINT =
  "agendamentos_barbeiro_data_hora_ocupado_key";

export function panelAgendamentoErrorMessage(message: string): string {
  const normalized = message.trim();
  if (
    normalized.includes(SLOT_OCCUPIED_HINT) ||
    /duplicate key value violates unique constraint/i.test(normalized)
  ) {
    return "Já existe um agendamento para este horário.";
  }
  return normalized;
}

export function parsePanelStatusRow(data: unknown): PanelStatusUpdateRow | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    status: row.status as AgendamentoPainelItem["status"] | undefined,
    client_confirmed_at: row.client_confirmed_at as string | null | undefined,
  };
}

const EXCLUIR_AGENDAMENTO_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Faça login novamente.",
  not_found: "Agendamento não encontrado.",
  forbidden: "Sem permissão para excluir este agendamento.",
};

export type ExcluirAgendamentoResult = { ok: true } | { error: string };

export function parseExcluirAgendamentoRpc(data: unknown): ExcluirAgendamentoResult {
  if (!data || typeof data !== "object") return { error: "Resposta inválida" };
  const row = data as Record<string, unknown>;
  if (row.error) {
    const key = String(row.error);
    return { error: EXCLUIR_AGENDAMENTO_ERROR_MESSAGES[key] ?? key };
  }
  if (row.ok === true) return { ok: true };
  return { error: "Resposta inválida" };
}

export async function rpcExcluirAgendamento(
  p_agendamento_id: string,
): Promise<ExcluirAgendamentoResult> {
  const { data, error } = await supabase.rpc("excluir_agendamento_painel", {
    p_agendamento_id,
  });
  if (error) return { error: panelAgendamentoErrorMessage(error.message) };
  return parseExcluirAgendamentoRpc(data);
}

export async function rpcAlterarAgendamentoPainel(
  p_agendamento_id: string,
  p_acao: "confirmar" | "nao_confirmado" | "cancelar",
) {
  return supabase.rpc("alterar_agendamento_painel", { p_agendamento_id, p_acao });
}

export async function rpcAlterarStatusPassado(p_agendamento_id: string, p_status: PastDayStatusKey) {
  return supabase.rpc("alterar_status_agendamento_passado_painel", { p_agendamento_id, p_status });
}
