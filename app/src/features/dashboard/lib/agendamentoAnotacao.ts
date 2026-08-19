import { supabase } from "@/integrations/supabase/client";
import { notifyPanelPacientesChanged } from "@agenda/lib/panelPacientesRefresh";
import {
  dispatchClienteNomeSync,
  emitClienteNomeUpdated,
} from "@agenda/lib/panelClienteNomeSync";

type AgendamentoAnotacaoPayload = {
  id?: string;
  conteudo: string;
  updated_at?: string;
  can_write: boolean;
  error?: string;
};

export type PacientePainelItem = {
  whatsapp_digits: string;
  cliente_nome: string;
  cliente_id?: string | null;
  conta_ativada?: boolean;
  data_nascimento?: string | null;
  avatar_url?: string | null;
  ultimo_atendimento: string;
  total_concluidos: number;
  total_anotacoes: number;
  can_rename_nome?: boolean;
};

export type ClienteCadastroPainelItem = {
  whatsapp_digits: string;
  cliente_nome: string;
  barbearia_id: string;
};

export type PacienteProfissional = {
  id: string;
  nome: string;
  barbearia_id: string;
};

export type PacientesPainelPage = {
  pacientes: PacientePainelItem[];
  profissionais: PacienteProfissional[];
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export const PACIENTES_PAINEL_PAGE_LIMIT = 50;

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

export async function updatePacienteDataNascimento(
  whatsappDigits: string,
  dataNascimento: string | null,
) {
  const { data, error } = await supabase.rpc("update_paciente_data_nascimento_painel", {
    p_whatsapp_digits: whatsappDigits,
    p_data_nascimento: dataNascimento,
  });
  if (error) return { error: error.message };
  const row = data as { error?: string; ok?: boolean; data_nascimento?: string | null } | null;
  if (row?.error) return { error: row.error };
  return { ok: true, data_nascimento: row?.data_nascimento ?? dataNascimento };
}

export async function updatePacienteAvatar(whatsappDigits: string, avatarUrl: string) {
  const { data, error } = await supabase.rpc("update_paciente_avatar_painel", {
    p_whatsapp_digits: whatsappDigits,
    p_avatar_url: avatarUrl,
  });
  if (error) return { error: error.message };
  const row = data as { error?: string; ok?: boolean; avatar_url?: string | null } | null;
  if (row?.error) return { error: row.error };
  return { ok: true, avatar_url: row?.avatar_url ?? avatarUrl };
}

export async function updatePacienteWhatsapp(whatsappDigits: string, newWhatsappDigits: string) {
  const { data, error } = await supabase.rpc("update_paciente_whatsapp_painel", {
    p_whatsapp_digits: whatsappDigits,
    p_new_whatsapp: newWhatsappDigits,
  });
  if (error) return { error: error.message };
  const row = data as {
    error?: string;
    ok?: boolean;
    whatsapp_digits?: string;
    previous_whatsapp_digits?: string;
  } | null;
  if (row?.error) {
    if (row.error === "already_exists") {
      return { error: "Já existe um paciente com este WhatsApp." };
    }
    return { error: row.error };
  }
  notifyPanelPacientesChanged();
  return {
    ok: true as const,
    whatsapp_digits: row?.whatsapp_digits ?? newWhatsappDigits,
    previous_whatsapp_digits: row?.previous_whatsapp_digits ?? whatsappDigits,
  };
}

export async function updatePacienteNome(whatsappDigits: string, nome: string) {
  const { data, error } = await supabase.rpc("update_paciente_nome_painel", {
    p_whatsapp_digits: whatsappDigits,
    p_nome: nome,
  });
  if (error) return { error: error.message };
  const row = data as { error?: string; ok?: boolean; nome?: string } | null;
  if (row?.error) return { error: row.error };
  const nomeFinal = row?.nome ?? nome;
  const payload = { whatsapp_digits: whatsappDigits, nome: nomeFinal };
  dispatchClienteNomeSync(payload);
  void emitClienteNomeUpdated(payload);
  return { ok: true, nome: nomeFinal };
}

async function removePacienteStorageFiles(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;

  const docPaths = unique.filter((p) => !p.endsWith(".jpg"));
  const avatarPaths = unique.filter((p) => p.endsWith(".jpg"));

  if (docPaths.length > 0) {
    await supabase.storage.from("paciente-documentos").remove(docPaths);
  }
  if (avatarPaths.length > 0) {
    await supabase.storage.from("barbershop-avatars").remove(avatarPaths);
  }
}

export async function deletePacienteCadastroPainel(whatsappDigits: string) {
  const { data, error } = await supabase.rpc("delete_paciente_cadastro_painel", {
    p_whatsapp_digits: whatsappDigits,
  });
  if (error) return { error: error.message };
  const row = data as { error?: string; ok?: boolean; storage_paths?: unknown } | null;
  if (row?.error) return { error: row.error };

  const storagePaths = Array.isArray(row?.storage_paths)
    ? row.storage_paths.filter((p): p is string => typeof p === "string")
    : [];
  await removePacienteStorageFiles(storagePaths);

  notifyPanelPacientesChanged();
  return { ok: true as const };
}

export async function getPatientActivationLink(
  whatsappDigits: string,
): Promise<{ ok: true; url: string } | { error: string }> {
  const { data, error } = await supabase.rpc("get_or_create_patient_activation_link", {
    p_whatsapp_digits: whatsappDigits,
  });
  if (error) return { error: error.message };
  const row = data as { error?: string; token?: string } | null;
  if (!row || row.error) {
    const code = row?.error ?? "unknown";
    if (code === "no_formal_cadastro") {
      return { error: "Este paciente não possui cadastro formal para ativação." };
    }
    if (code === "already_activated") {
      return { error: "Este paciente já possui conta ativada." };
    }
    if (code === "forbidden") {
      return { error: "Sem permissão para gerar o link de ativação." };
    }
    return { error: String(code) };
  }
  const token = row.token?.trim();
  if (!token) return { error: "Resposta inválida" };
  const url = `${window.location.origin}/ativar-paciente?token=${encodeURIComponent(token)}`;
  return { ok: true, url };
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

export function parsePacientesRpc(data: unknown): PacientesPainelPage | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.error) return null;
  const pacientes = parseJsonArray(row.pacientes) as PacientePainelItem[];
  const totalCount = typeof row.total_count === "number" ? row.total_count : pacientes.length;
  const limit =
    typeof row.limit === "number" ? row.limit : PACIENTES_PAINEL_PAGE_LIMIT;
  const offset = typeof row.offset === "number" ? row.offset : 0;
  const hasMore =
    typeof row.has_more === "boolean"
      ? row.has_more
      : offset + pacientes.length < totalCount;
  return {
    pacientes,
    profissionais: parseJsonArray(row.profissionais) as PacienteProfissional[],
    total_count: totalCount,
    limit,
    offset,
    has_more: hasMore,
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

export function parseClientesCadastroRpc(
  data: unknown,
): { clientes: ClienteCadastroPainelItem[]; total_count: number } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.error) return null;
  const clientes = parseJsonArray(row.clientes) as ClienteCadastroPainelItem[];
  const total_count = typeof row.total_count === "number" ? row.total_count : clientes.length;
  return { clientes, total_count };
}

export async function createPacienteCadastroPainel(
  whatsappDigits: string,
  nome: string,
  dataNascimento: string | null,
): Promise<{ ok: true; patient: PacientePainelItem } | { error: string; alreadyExists?: boolean }> {
  const { data, error } = await supabase.rpc("create_paciente_cadastro_painel", {
    p_whatsapp: whatsappDigits,
    p_nome: nome.trim(),
    p_data_nascimento: dataNascimento || null,
  });
  if (error) return { error: error.message };
  const row = data as Record<string, unknown> | null;
  if (!row) return { error: "Resposta inválida" };
  if (row.error === "already_exists") {
    return {
      error: "Já existe um paciente com este WhatsApp.",
      alreadyExists: true,
    };
  }
  if (row.error) return { error: String(row.error) };
  const patient = row.patient as PacientePainelItem | undefined;
  if (!patient?.whatsapp_digits) return { error: "Resposta inválida" };
  notifyPanelPacientesChanged();
  return { ok: true, patient };
}

export async function searchClientesCadastroPainel(
  barbeariaId: string,
  search: string,
  limit = 50,
): Promise<{ clientes: ClienteCadastroPainelItem[] } | { error: string }> {
  const { data, error } = await supabase.rpc("search_clientes_cadastro_painel", {
    p_barbearia_id: barbeariaId,
    p_search: search,
    p_limit: limit,
  });
  if (error) return { error: error.message };
  if (data && typeof data === "object" && "error" in data) {
    return { error: String((data as { error?: string }).error ?? "Erro na busca") };
  }
  const parsed = parseClientesCadastroRpc(data);
  if (!parsed) return { error: "Resposta inválida" };
  return { clientes: parsed.clientes };
}
