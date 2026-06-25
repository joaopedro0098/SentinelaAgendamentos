import { getClientConfirmationBadgeForPanel } from "@/lib/appointmentConfirmationMessage";
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
  status: "confirmado" | "cancelado" | "nao_veio";
};

export type AgendamentoPainelSummary = {
  total: number;
  confirmados: number;
  aguardando_confirmacao: number;
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
  | "aguardando_confirmacao"
  | "cancelado"
  | "faltou";

export type AgendamentoStatusKind = "nao_confirmado" | "confirmado" | "cancelado" | "faltou";

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getWeekRange(anchor: Date) {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function getMonthRange(anchor: Date) {
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

export function itemStatusKey(item: AgendamentoPainelItem): StatusFilter {
  if (item.status === "cancelado") return "cancelado";
  if (item.status === "nao_veio") return "faltou";
  if (item.requires_client_confirmation && !item.client_confirmed_at) return "aguardando_confirmacao";
  return "confirmado";
}

export function getStatusKind(item: AgendamentoPainelItem): AgendamentoStatusKind {
  if (item.status === "cancelado") return "cancelado";
  if (item.status === "nao_veio") return "faltou";
  if (item.requires_client_confirmation && !item.client_confirmed_at) return "nao_confirmado";
  return "confirmado";
}

export function matchesStatusFilter(item: AgendamentoPainelItem, filter: StatusFilter) {
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

export function getDisplayBadge(item: AgendamentoPainelItem) {
  if (item.status === "cancelado") return { label: "Cancelado", tone: "cancelado" as const };
  if (item.status === "nao_veio") return { label: "Faltou", tone: "faltou" as const };
  const badge = getClientConfirmationBadgeForPanel(item);
  if (badge === "pending") return { label: "Não confirmado", tone: "pendente" as const };
  return { label: "Confirmado", tone: "confirmado" as const };
}

export function isPastDay(dateYmd: string) {
  return isPastCalendarDate(dateYmd);
}
