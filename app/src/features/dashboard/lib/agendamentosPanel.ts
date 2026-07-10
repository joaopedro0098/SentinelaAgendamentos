import { isPastCalendarDate } from "@agenda/lib/appointmentDates";

export type ViewMode = "dia" | "semana" | "mes";

export type AgendamentoPainelItem = {
  id: string;
  data: string;
  hora: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  duracao_minutos: number;
  servicos_nomes: string[];
  observacao: string | null;
  barbeiro_id: string;
  barbeiro_nome: string;
  barbearia_id: string;
  confirmation_token: string;
  client_confirmed_at: string | null;
  requires_client_confirmation: boolean;
  status: "confirmado" | "concluido" | "cancelado" | "nao_veio" | "aguardando_pagamento";
  valor_base_centavos?: number | null;
  valor_pago_centavos?: number | null;
  valor_restante_centavos?: number | null;
  payment_expires_at?: string | null;
  payment_status?: string | null;
  can_manage?: boolean;
};

export type AgendamentoPainelSummary = {
  total: number;
  confirmados: number;
  concluidos: number;
  aguardando_confirmacao: number;
  aguardando_pagamento?: number;
  cancelados: number;
  faturamento_centavos: number;
};

export type AgendamentoProfissional = {
  id: string;
  nome: string;
  barbearia_id: string;
};

export type StatusFilter =
  | "todos"
  | "confirmado"
  | "concluido"
  | "aguardando_confirmacao"
  | "aguardando_pagamento"
  | "cancelado"
  | "faltou";

export type AgendamentoStatusKind =
  | "nao_confirmado"
  | "confirmado"
  | "concluido"
  | "cancelado"
  | "faltou"
  | "aguardando_pagamento";

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Semana domingo–sábado (padrão brasileiro). */
export function getWeekRange(anchor: Date) {
  const d = new Date(anchor);
  d.setHours(12, 0, 0, 0);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function getMonthRange(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start, end };
}

export function getPeriodRange(viewMode: ViewMode, anchorYmd: string) {
  const anchor = parseYmd(anchorYmd);
  if (viewMode === "dia") {
    return { start: anchor, end: anchor, startYmd: anchorYmd, endYmd: anchorYmd };
  }
  if (viewMode === "semana") {
    const { start, end } = getWeekRange(anchor);
    return { start, end, startYmd: ymd(start), endYmd: ymd(end) };
  }
  const { start, end } = getMonthRange(anchor);
  return { start, end, startYmd: ymd(start), endYmd: ymd(end) };
}

export function formatMoney(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "confirmado", label: "Confirmado" },
  { value: "concluido", label: "Concluído" },
  { value: "aguardando_confirmacao", label: "Não confirmado" },
  { value: "aguardando_pagamento", label: "Aguardando pagamento" },
  { value: "cancelado", label: "Cancelado" },
  { value: "faltou", label: "Faltou" },
];

/** Opções de status conforme o período visível no painel. */
export function getStatusFilterOptions(periodStartYmd: string, periodEndYmd: string) {
  const todayYmd = ymd(new Date());
  const includesPastDays = periodStartYmd < todayYmd;
  const includesTodayOrFuture = periodEndYmd >= todayYmd;

  return STATUS_FILTER_OPTIONS.filter((o) => {
    if (o.value === "faltou") return includesPastDays;
    if (o.value === "confirmado" || o.value === "aguardando_confirmacao" || o.value === "aguardando_pagamento") {
      return includesTodayOrFuture;
    }
    return true;
  });
}

/** Linhas do resumo do período (Agendamentos) conforme o intervalo visível. */
export function getPeriodSummaryVisibility(periodStartYmd: string, periodEndYmd: string) {
  const todayYmd = ymd(new Date());
  const includesPastDaysBeforeToday = periodStartYmd < todayYmd;
  const includesTodayOrFuture = periodEndYmd >= todayYmd;
  const includesTodayOrPast = periodStartYmd <= todayYmd;

  return {
    confirmados: includesTodayOrFuture,
    concluidos: includesTodayOrPast,
    aguardando_confirmacao: includesTodayOrFuture,
    aguardando_pagamento: includesTodayOrFuture,
    cancelados: includesTodayOrPast,
    faltas: includesPastDaysBeforeToday,
  };
}

function itemStatusKey(item: AgendamentoPainelItem): StatusFilter {
  if (item.status === "aguardando_pagamento") return "aguardando_pagamento";
  if (item.status === "cancelado") return "cancelado";
  if (item.status === "nao_veio") return "faltou";
  if (item.status === "concluido") return "concluido";
  if (item.requires_client_confirmation && !item.client_confirmed_at) return "aguardando_confirmacao";
  return "confirmado";
}

export function getStatusKind(item: AgendamentoPainelItem): AgendamentoStatusKind {
  if (item.status === "aguardando_pagamento") return "aguardando_pagamento";
  if (item.status === "cancelado") return "cancelado";
  if (item.status === "nao_veio") return "faltou";
  if (item.status === "concluido") return "concluido";
  if (item.requires_client_confirmation && !item.client_confirmed_at) return "nao_confirmado";
  return "confirmado";
}

function matchesStatusFilter(item: AgendamentoPainelItem, filter: StatusFilter) {
  if (filter === "todos") return true;
  return itemStatusKey(item) === filter;
}

export function filterAgendamentos(
  items: AgendamentoPainelItem[],
  profissionalId: string | null,
  servico: string | null,
  status: StatusFilter,
) {
  return items.filter((item) => {
    if (profissionalId && item.barbeiro_id !== profissionalId) return false;
    if (servico && !item.servicos_nomes.includes(servico)) return false;
    if (!matchesStatusFilter(item, status)) return false;
    return true;
  });
}

export function servicesInPeriod(items: AgendamentoPainelItem[]) {
  const set = new Set<string>();
  for (const item of items) {
    for (const s of item.servicos_nomes) {
      if (s.trim()) set.add(s);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** CT: própria barbearia + CAs. CA: somente a própria. */
export function buildVisibleBarbeariaIds(
  barbeariaId: string | null,
  caBarbearias: { barbeariaId: string }[],
  isCA: boolean,
) {
  const ids: string[] = [];
  if (barbeariaId) ids.push(barbeariaId);
  if (!isCA) {
    for (const ca of caBarbearias) {
      if (ca.barbeariaId && !ids.includes(ca.barbeariaId)) ids.push(ca.barbeariaId);
    }
  }
  return ids;
}

export function isPastDay(dateYmd: string) {
  return isPastCalendarDate(dateYmd);
}

function isFutureDay(dateYmd: string) {
  return dateYmd > ymd(new Date());
}

function isTodayOrPastDay(dateYmd: string) {
  return dateYmd <= ymd(new Date());
}

export function canManageAgendamento(item: { barbearia_id: string; can_manage?: boolean }, ownBarbeariaId: string | null) {
  if (typeof item.can_manage === "boolean") return item.can_manage;
  return ownBarbeariaId !== null && item.barbearia_id === ownBarbeariaId;
}

/** Anotação: concluído na barbearia própria com profissional da mesma conta (CT nunca em CA). */
function canWriteAnotacao(
  item: Pick<AgendamentoPainelItem, "status" | "barbearia_id" | "barbeiro_id">,
  ownBarbeariaId: string | null,
  caBarbeariaIds: string[] = [],
  profissionais: Pick<AgendamentoProfissional, "id" | "barbearia_id">[] = [],
) {
  if (item.status !== "concluido") return false;
  if (caBarbeariaIds.includes(item.barbearia_id)) return false;
  const prof = profissionais.find((p) => p.id === item.barbeiro_id);
  if (prof && caBarbeariaIds.includes(prof.barbearia_id)) return false;
  return ownBarbeariaId !== null && item.barbearia_id === ownBarbeariaId;
}

/** Abre modal de anotação (edição ou somente leitura). */
export function canOpenAnotacaoConcluido(
  item: Pick<AgendamentoPainelItem, "status" | "barbearia_id" | "barbeiro_id">,
  ownBarbeariaId: string | null,
  caBarbeariaIds: string[] = [],
  profissionais: Pick<AgendamentoProfissional, "id" | "barbearia_id">[] = [],
) {
  if (item.status !== "concluido") return false;
  if (canWriteAnotacao(item, ownBarbeariaId, caBarbeariaIds, profissionais)) return true;
  if (!ownBarbeariaId || caBarbeariaIds.length === 0) return false;
  if (caBarbeariaIds.includes(item.barbearia_id)) return true;
  const prof = profissionais.find((p) => p.id === item.barbeiro_id);
  return !!prof && caBarbeariaIds.includes(prof.barbearia_id);
}

export type PastDayStatusKey = "concluido" | "faltou" | "cancelado";

export type AgendamentoStatusMenuAction = {
  key: PastDayStatusKey;
  label: string;
  destructive?: boolean;
};

export function parsePainelRpc(data: unknown): {
  items: AgendamentoPainelItem[];
  profissionais: AgendamentoProfissional[];
  summary: AgendamentoPainelSummary;
} | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.error) return null;
  const summary = row.summary as AgendamentoPainelSummary | undefined;
  if (!summary) return null;
  return {
    items: (Array.isArray(row.items) ? row.items : []) as AgendamentoPainelItem[],
    profissionais: (Array.isArray(row.profissionais) ? row.profissionais : []) as AgendamentoProfissional[],
    summary,
  };
}

export function formatPaymentSummary(item: AgendamentoPainelItem) {
  if (item.status !== "aguardando_pagamento") return null;
  const paid = item.valor_pago_centavos ?? 0;
  const rest = item.valor_restante_centavos ?? 0;
  if (paid <= 0 && rest <= 0) return null;
  if (rest > 0) {
    return `${formatMoney(paid)} online · ${formatMoney(rest)} presencial`;
  }
  return `${formatMoney(paid)} a pagar`;
}

export function getAppointmentStatusMenuActions(
  item: { status: AgendamentoPainelItem["status"] },
  dateYmd: string,
): AgendamentoStatusMenuAction[] {
  if (item.status === "aguardando_pagamento") return [];
  if (isFutureDay(dateYmd)) return [];

  const allowConcluido = isTodayOrPastDay(dateYmd);
  const allowFaltou = isPastDay(dateYmd);

  let actions: AgendamentoStatusMenuAction[] = [];

  if (item.status === "nao_veio") {
    actions = [
      { key: "concluido", label: "Concluído" },
      { key: "cancelado", label: "Cancelado", destructive: true },
    ];
  } else if (item.status === "confirmado") {
    actions = [
      { key: "concluido", label: "Concluído" },
      { key: "faltou", label: "Faltou", destructive: true },
      { key: "cancelado", label: "Cancelado", destructive: true },
    ];
  } else if (item.status === "concluido") {
    actions = [
      { key: "faltou", label: "Faltou", destructive: true },
      { key: "cancelado", label: "Cancelado", destructive: true },
    ];
  } else if (item.status === "cancelado") {
    actions = [
      { key: "concluido", label: "Concluído" },
      { key: "faltou", label: "Faltou", destructive: true },
    ];
  }

  return actions.filter((action) => {
    if (action.key === "concluido") return allowConcluido;
    if (action.key === "faltou") return allowFaltou;
    return true;
  });
}
