import { supabase } from "@/integrations/supabase/client";
import { notifyPanelPacientesChanged } from "@agenda/lib/panelPacientesRefresh";

export type AgendamentoAnotacaoPayload = {
  id?: string;
  conteudo: string;
  updated_at?: string;
  can_write: boolean;
  error?: string;
};

export type PacientePainelItem = {
  whatsapp_digits: string;
  cliente_nome: string;
  ultimo_atendimento: string;
  total_concluidos: number;
  total_anotacoes: number;
};

export type PacienteProfissional = {
  id: string;
  nome: string;
  barbearia_id: string;
};

export type PacienteAnotacaoItem = {
  agendamento_id: string;
  data: string;
  hora: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  barbearia_id: string;
  barbeiro_nome: string;
  servicos_nomes: string[];
  anotacao_conteudo: string | null;
  anotacao_updated_at: string | null;
  can_write: boolean;
};

export async function fetchAgendamentoAnotacao(agendamentoId: string) {
  const { data, error } = await supabase.rpc("get_agendamento_anotacao", {
    p_agendamento_id: agendamentoId,
  });
  if (error) return { error: error.message, conteudo: "", can_write: false };
  const row = data as AgendamentoAnotacaoPayload | null;
  if (!row || row.error) {
    return { error: row?.error ?? "Erro ao carregar", conteudo: "", can_write: false };
  }
  return row;
}

export async function saveAgendamentoAnotacao(agendamentoId: string, conteudo: string) {
  const { data, error } = await supabase.rpc("upsert_agendamento_anotacao", {
    p_agendamento_id: agendamentoId,
    p_conteudo: conteudo,
  });
  if (error) return { error: error.message };
  const row = data as { error?: string; ok?: boolean } | null;
  if (row?.error) return { error: row.error };
  notifyPanelPacientesChanged();
  return { ok: true, data: row };
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeStringArray(value: unknown): string[] {
  return parseJsonArray(value).filter((v): v is string => typeof v === "string");
}

export function parsePacientesRpc(data: unknown): {
  pacientes: PacientePainelItem[];
  profissionais: PacienteProfissional[];
} | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.error) return null;
  return {
    pacientes: parseJsonArray(row.pacientes) as PacientePainelItem[],
    profissionais: parseJsonArray(row.profissionais) as PacienteProfissional[],
  };
}

export function parsePacienteAnotacoesRpc(data: unknown): PacienteAnotacaoItem[] | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.error) return null;
  const items = parseJsonArray(row.items) as Record<string, unknown>[];
  return items.map((item) => ({
    ...(item as unknown as PacienteAnotacaoItem),
    servicos_nomes: normalizeStringArray(item.servicos_nomes),
  }));
}
