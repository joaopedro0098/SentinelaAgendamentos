import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import type { RescheduleContext } from "@agenda/pages/PublicBooking";
import { supabase } from "@agenda/integrations/supabase/client";
import { buildSlots, filtrarSlotsLivres, type Window } from "@agenda/lib/slots";
import type { CaBarbearia, DashboardShop } from "@/providers/DashboardShopProvider";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildAppointmentConfirmationMessage,
  buildClientWhatsAppUrl,
} from "@/lib/appointmentConfirmationMessage";
import {
  filterAgendamentos,
  formatMoney,
  getPeriodRange,
  isPastDay,
  parseYmd,
  servicesInPeriod,
  type AgendamentoPainelItem,
  type AgendamentoPainelSummary,
  type AgendamentoProfissional,
  type StatusFilter,
  type ViewMode,
  ymd,
} from "@/features/dashboard/lib/agendamentosPanel";
import { AgendamentosMiniCalendar, monthStart } from "@/features/dashboard/components/agendamentos/AgendamentosMiniCalendar";
import { MinimalFilterSelect } from "@/features/dashboard/components/agendamentos/MinimalFilterSelect";
import { AgendamentoStatusBadge } from "@/features/dashboard/components/agendamentos/AgendamentoStatusBadge";
import {
  AgendamentoActionsMenu,
  AgendamentoMenuAction,
  AgendamentoMenuActionLoading,
} from "@/features/dashboard/components/agendamentos/AgendamentoActionsMenu";
import { usePanelAgendamentosRefresh } from "@/features/dashboard/hooks/usePanelAgendamentosRefresh";

type Props = {
  slug: string | null;
  barbeariaId: string | null;
  caBarbearias: CaBarbearia[];
  shop: DashboardShop | null;
  allBarbeariaIds: string[];
};

type BookingProfSchedule = {
  id: string;
  slot_minutos: number;
  disponibilidades: { dia_semana: number; hora_inicio: string; hora_fim: string }[];
  bloqueios: { data: string; hora_inicio: string | null; hora_fim: string | null }[];
};

type TimelineEntry =
  | { kind: "appointment"; item: AgendamentoPainelItem; sortMin: number; barbeiroId?: string }
  | { kind: "empty"; hora: string; sortMin: number; barbeiroId: string }
  | { kind: "gap"; horaInicio: string; horaFim: string; sortMin: number; barbeiroId: string };

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "confirmado", label: "Confirmado" },
  { value: "aguardando_confirmacao", label: "Não confirmado" },
  { value: "cancelado", label: "Cancelado" },
  { value: "faltou", label: "Faltou" },
];

const LIST_ROW_GRID = cn(
  "grid w-full grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.2fr)_8.5rem_6.5rem_2rem] items-center gap-x-3 px-6",
);

function formatHora(hora: string) {
  return String(hora).slice(0, 5);
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function parsePainelRpc(data: unknown): {
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

function parseBookingProfessionals(data: unknown): BookingProfSchedule[] {
  let raw: unknown[] = [];
  if (Array.isArray(data)) raw = data;
  else if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      raw = Array.isArray(parsed) ? parsed : [];
    } catch {
      raw = [];
    }
  }
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.barbeiro_id ?? r.id ?? ""),
      slot_minutos: Number(r.slot_minutos ?? 30),
      disponibilidades: (r.disponibilidades as BookingProfSchedule["disponibilidades"]) ?? [],
      bloqueios: (r.bloqueios as BookingProfSchedule["bloqueios"]) ?? [],
    };
  });
}

function buildDayTimeline(
  dateYmd: string,
  visibleAppointments: AgendamentoPainelItem[],
  occupancyAppointments: AgendamentoPainelItem[],
  prof: BookingProfSchedule,
  barbeiroId: string,
): TimelineEntry[] {
  const dow = new Date(`${dateYmd}T12:00:00`).getDay();
  const windows: Window[] = prof.disponibilidades
    .filter((d) => d.dia_semana === dow)
    .map((d) => ({
      hora_inicio: d.hora_inicio.slice(0, 5),
      hora_fim: d.hora_fim.slice(0, 5),
    }))
    .sort((a, b) => toMin(a.hora_inicio) - toMin(b.hora_inicio));

  if (!windows.length) return [];

  const slotMin = prof.slot_minutos || 30;
  const entries: TimelineEntry[] = [];

  for (let i = 0; i < windows.length - 1; i++) {
    const endPrev = toMin(windows[i].hora_fim);
    const startNext = toMin(windows[i + 1].hora_inicio);
    if (startNext > endPrev) {
      entries.push({
        kind: "gap",
        horaInicio: toHHMM(endPrev),
        horaFim: windows[i + 1].hora_inicio.slice(0, 5),
        sortMin: endPrev,
        barbeiroId,
      });
    }
  }

  for (const item of visibleAppointments) {
    entries.push({ kind: "appointment", item, sortMin: toMin(formatHora(item.hora)), barbeiroId });
  }

  const allSlots = buildSlots(windows, slotMin);
  const ocup = new Map<string, number>();
  for (const a of occupancyAppointments) {
    if (a.status !== "cancelado") {
      ocup.set(formatHora(a.hora), a.duracao_minutos);
    }
  }
  const dayBloqs = prof.bloqueios.filter((b) => b.data === dateYmd);
  const livres = filtrarSlotsLivres(allSlots, windows, ocup, dayBloqs, slotMin);
  const occupiedStarts = new Set(
    occupancyAppointments.filter((a) => a.status !== "cancelado").map((a) => formatHora(a.hora)),
  );

  for (const hora of livres) {
    if (!occupiedStarts.has(hora)) {
      entries.push({ kind: "empty", hora, sortMin: toMin(hora), barbeiroId });
    }
  }

  return entries.sort((a, b) => a.sortMin - b.sortMin);
}

function mergeDayTimelines(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.sortMin !== b.sortMin) return a.sortMin - b.sortMin;
    const profA = a.kind === "appointment" ? a.item.barbeiro_id : a.barbeiroId;
    const profB = b.kind === "appointment" ? b.item.barbeiro_id : b.barbeiroId;
    return profA.localeCompare(profB);
  });
}

function formatPeriodTitle(viewMode: ViewMode, anchorYmd: string) {
  const anchor = parseYmd(anchorYmd);
  if (viewMode === "dia") {
    return anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (viewMode === "semana") {
    const { start, end } = getPeriodRange("semana", anchorYmd);
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString("pt-BR", { day: "numeric", month: sameMonth ? undefined : "short" });
    const endLabel = end.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }
  return anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function shiftAnchor(viewMode: ViewMode, anchorYmd: string, delta: number) {
  const d = parseYmd(anchorYmd);
  if (viewMode === "dia") {
    d.setDate(d.getDate() + delta);
  } else if (viewMode === "semana") {
    d.setDate(d.getDate() + delta * 7);
  } else {
    d.setMonth(d.getMonth() + delta);
  }
  return ymd(d);
}

export default function AgendamentosDesktopPanel({
  slug,
  barbeariaId,
  caBarbearias,
  shop,
  allBarbeariaIds,
}: Props) {
  const navigate = useNavigate();
  const { slotGridRevision } = useDashboardShop();
  const [viewMode, setViewMode] = useState<ViewMode>("dia");
  const [anchorYmd, setAnchorYmd] = useState(() => ymd(new Date()));
  const [displayMonth, setDisplayMonth] = useState(() => monthStart(new Date()));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AgendamentoPainelItem[]>([]);
  const [profissionais, setProfissionais] = useState<AgendamentoProfissional[]>([]);
  const [summary, setSummary] = useState<AgendamentoPainelSummary>({
    total: 0,
    confirmados: 0,
    aguardando_confirmacao: 0,
    cancelados: 0,
    faturamento_centavos: 0,
  });
  const [profFilter, setProfFilter] = useState("todos");
  const [servicoFilter, setServicoFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [deleteTarget, setDeleteTarget] = useState<AgendamentoPainelItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);
  const [markingNoShowId, setMarkingNoShowId] = useState<string | null>(null);
  const [profSchedules, setProfSchedules] = useState<BookingProfSchedule[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const period = useMemo(() => getPeriodRange(viewMode, anchorYmd), [viewMode, anchorYmd]);
  const profissionalId = profFilter === "todos" ? null : profFilter;
  const servico = servicoFilter === "todos" ? null : servicoFilter;

  const loadData = useCallback(async () => {
    if (!allBarbeariaIds.length) {
      setItems([]);
      setProfissionais([]);
      setSummary({
        total: 0,
        confirmados: 0,
        aguardando_confirmacao: 0,
        cancelados: 0,
        faturamento_centavos: 0,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_agendamentos_painel", {
      p_data_inicio: period.startYmd,
      p_data_fim: period.endYmd,
    });
    if (error) {
      toast({ title: "Não foi possível carregar", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const parsed = parsePainelRpc(data);
    if (parsed) {
      setItems(parsed.items);
      setProfissionais(parsed.profissionais);
      setSummary(parsed.summary);
    }
    setLoading(false);
  }, [allBarbeariaIds.length, period.startYmd, period.endYmd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePanelRefresh = useCallback(
    (detail?: { data?: string }) => {
      if (detail?.data) setAnchorYmd(detail.data);
      void loadData();
    },
    [loadData],
  );

  usePanelAgendamentosRefresh(handlePanelRefresh);

  useEffect(() => {
    if (!allBarbeariaIds.length) return;
    const channels = allBarbeariaIds.map((bid) =>
      supabase
        .channel(`painel-agendamentos-desktop:${bid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agendamentos", filter: `barbearia_id=eq.${bid}` },
          () => {
            void loadData();
          },
        )
        .subscribe(),
    );
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [allBarbeariaIds, loadData]);

  const loadDaySchedules = useCallback(async () => {
    if (!slug || viewMode !== "dia") {
      setProfSchedules([]);
      return;
    }
    setLoadingSchedule(true);
    await supabase.rpc("ensure_agenda_from_barbershop_slug", { p_slug: slug });
    const { data, error } = await supabase.rpc("get_booking_professionals", {
      p_slug: slug,
      p_from: anchorYmd,
      p_to: anchorYmd,
    });
    if (error) {
      setProfSchedules([]);
      setLoadingSchedule(false);
      return;
    }
    setProfSchedules(parseBookingProfessionals(data));
    setLoadingSchedule(false);
  }, [slug, viewMode, anchorYmd, slotGridRevision]);

  useEffect(() => {
    void loadDaySchedules();
  }, [loadDaySchedules]);

  useEffect(() => {
    setDisplayMonth(monthStart(parseYmd(anchorYmd)));
  }, [anchorYmd]);

  const servicoOptions = useMemo(() => {
    const names = servicesInPeriod(items);
    return [{ value: "todos", label: "Todos" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [items]);

  const profOptions = useMemo(
    () => [
      { value: "todos", label: "Todos" },
      ...profissionais.map((p) => ({ value: p.id, label: p.nome })),
    ],
    [profissionais],
  );

  const filteredList = useMemo(
    () => filterAgendamentos(items, profissionalId, servico, statusFilter),
    [items, profissionalId, servico, statusFilter],
  );

  const showTimeline = viewMode === "dia" && profSchedules.length > 0;

  const listRows = useMemo(() => {
    if (showTimeline) {
      const dayItemsAll = items.filter((a) => a.data === anchorYmd);
      const dayItemsVisible = filteredList.filter((a) => a.data === anchorYmd);
      const schedules = profissionalId
        ? profSchedules.filter((p) => p.id === profissionalId)
        : profSchedules;

      const entries: TimelineEntry[] = [];
      for (const prof of schedules) {
        const visible = dayItemsVisible.filter((a) => a.barbeiro_id === prof.id);
        const occupancy = dayItemsAll.filter((a) => a.barbeiro_id === prof.id);
        entries.push(...buildDayTimeline(anchorYmd, visible, occupancy, prof, prof.id));
      }
      return mergeDayTimelines(entries);
    }
    const sorted = [...filteredList].sort((a, b) => {
      const cmp = a.data.localeCompare(b.data);
      if (cmp !== 0) return cmp;
      return formatHora(a.hora).localeCompare(formatHora(b.hora));
    });
    return sorted.map((item) => ({
      kind: "appointment" as const,
      item,
      sortMin: toMin(formatHora(item.hora)),
    }));
  }, [showTimeline, profSchedules, filteredList, items, anchorYmd, profissionalId]);

  const listIsEmpty =
    !loading &&
    !loadingSchedule &&
    listRows.length === 0;

  function goAgendar(prefill?: { data: string; hora?: string; barbeiroId?: string }) {
    navigate("/app/agendar", { state: prefill ? { prefill } : undefined });
  }

  function handleAlterar(a: AgendamentoPainelItem) {
    const payload: RescheduleContext = {
      agendamentoId: a.id,
      barbeiroId: a.barbeiro_id,
      data: a.data,
      hora: formatHora(a.hora),
      cliente_nome: a.cliente_nome,
      cliente_whatsapp: a.cliente_whatsapp,
      observacao: a.observacao,
      duracao_minutos: a.duracao_minutos,
      servicos_nomes: a.servicos_nomes?.length ? a.servicos_nomes : undefined,
    };
    navigate("/app/agendar", { state: { reschedule: payload } });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const removedId = deleteTarget.id;
    setDeleting(true);
    const { error } = await supabase.rpc("excluir_agendamento_painel", {
      p_agendamento_id: removedId,
    });
    setDeleting(false);
    if (error) {
      toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" });
      return;
    }
    setDeleteTarget(null);
    setItems((prev) => prev.filter((a) => a.id !== removedId));
    toast({ title: "Agendamento excluído" });
    void loadData();
  }

  function buildMessage(a: AgendamentoPainelItem) {
    return buildAppointmentConfirmationMessage({
      ...a,
      shop_name: shop?.display_name ?? null,
    });
  }

  function handleCopyConfirmationMessage(a: AgendamentoPainelItem) {
    const text = buildMessage(a);
    void navigator.clipboard.writeText(text).then(
      () => toast({ title: "Mensagem copiada" }),
      () => toast({ title: "Não foi possível copiar", variant: "destructive" }),
    );
  }

  function handleWhatsApp(a: AgendamentoPainelItem) {
    const message = buildMessage(a);
    const url = buildClientWhatsAppUrl(a.cliente_whatsapp, message);
    if (!url) {
      toast({ title: "WhatsApp inválido", description: "Verifique o número do cliente.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleStatusAction(
    a: AgendamentoPainelItem,
    action: "confirmar" | "nao_confirmado" | "cancelar",
  ) {
    if (statusChangingId || isPastDay(a.data)) return;
    setStatusChangingId(a.id);
    const { data, error } = await supabase.rpc("alterar_agendamento_painel", {
      p_agendamento_id: a.id,
      p_acao: action,
    });
    setStatusChangingId(null);
    if (error) {
      toast({ title: "Não foi possível alterar", description: error.message, variant: "destructive" });
      return;
    }
    const row = data as { status?: string; client_confirmed_at?: string | null } | null;
    setItems((prev) =>
      prev.map((item) =>
        item.id === a.id
          ? {
              ...item,
              status: (row?.status as AgendamentoPainelItem["status"]) ?? item.status,
              client_confirmed_at:
                row && "client_confirmed_at" in row ? row.client_confirmed_at ?? null : item.client_confirmed_at,
            }
          : item,
      ),
    );
    void loadData();
  }

  async function handleMarkNoShow(a: AgendamentoPainelItem) {
    if (markingNoShowId) return;
    setMarkingNoShowId(a.id);
    const { error } = await supabase.rpc("marcar_falta_agendamento_painel", {
      p_agendamento_id: a.id,
    });
    setMarkingNoShowId(null);
    if (error) {
      toast({ title: "Não foi possível marcar falta", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.map((row) => (row.id === a.id ? { ...row, status: "nao_veio" } : row)));
  }

  async function handleRevertNoShow(a: AgendamentoPainelItem) {
    if (markingNoShowId) return;
    setMarkingNoShowId(a.id);
    const { error } = await supabase.rpc("reverter_falta_agendamento_painel", {
      p_agendamento_id: a.id,
    });
    setMarkingNoShowId(null);
    if (error) {
      toast({ title: "Não foi possível reverter", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.map((row) => (row.id === a.id ? { ...row, status: "confirmado" } : row)));
  }

  function caLabel(itemBarbeariaId: string) {
    return caBarbearias.find((ca) => ca.barbeariaId === itemBarbeariaId)?.shopName ?? "CA";
  }

  function renderActionsMenu(a: AgendamentoPainelItem) {
    const isCancelled = a.status === "cancelado";
    const isNoShow = a.status === "nao_veio";
    const pastDay = isPastDay(a.data);
    const busy = statusChangingId === a.id || markingNoShowId === a.id;

    if (pastDay) {
      if (isNoShow) {
        return (
          <AgendamentoActionsMenu disabled={busy}>
            {busy ? (
              <AgendamentoMenuActionLoading />
            ) : (
              <AgendamentoMenuAction label="Reverter para confirmado" onClick={() => void handleRevertNoShow(a)} />
            )}
          </AgendamentoActionsMenu>
        );
      }
      if (!isCancelled && a.status === "confirmado") {
        return (
          <AgendamentoActionsMenu disabled={busy}>
            {busy ? (
              <AgendamentoMenuActionLoading />
            ) : (
              <AgendamentoMenuAction label="Marcar como faltou" onClick={() => void handleMarkNoShow(a)} />
            )}
          </AgendamentoActionsMenu>
        );
      }
      return null;
    }

    return (
      <AgendamentoActionsMenu disabled={busy}>
        {busy ? (
          <AgendamentoMenuActionLoading />
        ) : (
          <>
            {!isNoShow && !isCancelled && (
              <>
                <AgendamentoMenuAction label="WhatsApp" onClick={() => handleWhatsApp(a)} />
                <AgendamentoMenuAction label="Copiar mensagem" onClick={() => handleCopyConfirmationMessage(a)} />
                <AgendamentoMenuAction label="Alterar" onClick={() => handleAlterar(a)} />
                <AgendamentoMenuAction label="Excluir" destructive onClick={() => setDeleteTarget(a)} />
              </>
            )}
          </>
        )}
      </AgendamentoActionsMenu>
    );
  }

  function renderAppointmentRow(a: AgendamentoPainelItem) {
    const showDate = viewMode !== "dia";

    return (
      <div
        key={a.id}
        className={cn(LIST_ROW_GRID, "py-2.5 border-b border-border/60 hover:bg-secondary/20 transition-colors")}
      >
        <span className="min-w-0 text-sm font-semibold tabular-nums text-primary">
          {showDate ? (
            <>
              {parseYmd(a.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              <span className="text-muted-foreground font-normal mx-1">·</span>
            </>
          ) : null}
          {formatHora(a.hora)}
        </span>
        <span className="min-w-0 text-sm font-medium truncate">{a.cliente_nome}</span>
        <span className="min-w-0 text-sm text-muted-foreground truncate">
          {a.servicos_nomes?.length ? a.servicos_nomes.join(" · ") : "—"}
        </span>
        <AgendamentoStatusBadge
          item={a}
          busy={statusChangingId === a.id}
          allowStatusChange={!isPastDay(a.data)}
          onAction={(action) => void handleStatusAction(a, action)}
        />
        <div className="min-w-0 flex flex-col items-start gap-0.5">
          <span className="text-xs font-medium truncate text-primary/90">{a.barbeiro_nome}</span>
          {caBarbearias.length > 0 && a.barbearia_id !== barbeariaId && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground truncate max-w-full">
              {caLabel(a.barbearia_id)}
            </span>
          )}
        </div>
        {renderActionsMenu(a)}
      </div>
    );
  }

  if (!slug) {
    return (
      <div className="p-8 max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Configure sua empresa em Configurações para ver os agendamentos aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full">
      <aside className="w-[280px] shrink-0 border-r border-border/60 p-4 space-y-4 overflow-y-auto">
        <AgendamentosMiniCalendar
          viewMode={viewMode}
          anchorYmd={anchorYmd}
          onAnchorChange={setAnchorYmd}
          onMonthChange={(delta) =>
            setDisplayMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
          }
          displayMonth={displayMonth}
        />

        <div className="flex rounded-xl border border-border/70 p-0.5 bg-card/40">
          {(["dia", "semana", "mes"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition-colors",
                viewMode === mode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/50",
              )}
            >
              {mode === "dia" ? "Dia" : mode === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            aria-label="Período anterior"
            onClick={() => setAnchorYmd((cur) => shiftAnchor(viewMode, cur, -1))}
            className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold capitalize text-center flex-1 leading-tight">
            {formatPeriodTitle(viewMode, anchorYmd)}
          </p>
          <button
            type="button"
            aria-label="Próximo período"
            onClick={() => setAnchorYmd((cur) => shiftAnchor(viewMode, cur, 1))}
            className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <MinimalFilterSelect label="Profissional" value={profFilter} options={profOptions} onChange={setProfFilter} />
          <MinimalFilterSelect
            label="Serviço"
            value={servicoFilter}
            options={servicoOptions}
            onChange={setServicoFilter}
          />
          <MinimalFilterSelect
            label="Status"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/50 p-3 space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo do período</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{summary.total}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Confirmados</span>
            <span className="font-semibold tabular-nums text-available">{summary.confirmados}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Não confirmado</span>
            <span className="font-semibold tabular-nums">{summary.aguardando_confirmacao}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cancelados</span>
            <span className="font-semibold tabular-nums text-unavailable">{summary.cancelados}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-border/60">
            <span className="text-muted-foreground">Faturamento</span>
            <span className="font-semibold tabular-nums">{formatMoney(summary.faturamento_centavos)}</span>
          </div>
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border/60 shrink-0">
          <h1 className="text-lg font-semibold tracking-tight">Agendamentos</h1>
          <Button type="button" size="sm" className="rounded-full" onClick={() => goAgendar()}>
            <Plus className="h-4 w-4" />
            Novo agendamento
          </Button>
        </header>

        <div
          className={cn(
            LIST_ROW_GRID,
            "shrink-0 py-2 border-b border-border/40 bg-secondary/10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
          )}
        >
          <span className="min-w-0">Horário</span>
          <span className="min-w-0">Cliente</span>
          <span className="min-w-0">Serviços</span>
          <span className="min-w-0">Status</span>
          <span className="min-w-0">Profissional</span>
          <span aria-hidden />
        </div>

        <div className="flex-1 overflow-y-auto relative [scrollbar-gutter:stable]">
          {(loading || loadingSchedule) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!listIsEmpty ? (
            <div>
              {listRows.map((row, idx) => {
                if (row.kind === "gap") {
                  return (
                    <div
                      key={`gap-${row.barbeiroId}-${row.horaInicio}-${idx}`}
                      className={cn(LIST_ROW_GRID, "py-1 border-b border-border/40 bg-muted/15 text-[11px] text-muted-foreground/80")}
                    >
                      <span className="min-w-0 tabular-nums">
                        {row.horaInicio}
                        <span className="mx-1">–</span>
                        {row.horaFim}
                      </span>
                      <span className="min-w-0 italic">intervalo</span>
                      <span aria-hidden />
                      <span aria-hidden />
                      <span aria-hidden />
                      <span aria-hidden />
                    </div>
                  );
                }
                if (row.kind === "empty") {
                  return (
                    <div
                      key={`empty-${row.barbeiroId}-${row.hora}-${idx}`}
                      className={cn(LIST_ROW_GRID, "py-1 border-b border-border/40")}
                    >
                      <span className="min-w-0 text-sm tabular-nums text-muted-foreground">{row.hora}</span>
                      <span className="min-w-0 text-[11px] text-muted-foreground/70 italic">vazio</span>
                      <span aria-hidden />
                      <span aria-hidden />
                      <span aria-hidden />
                      <span aria-hidden />
                    </div>
                  );
                }
                return renderAppointmentRow(row.item);
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
              Nenhum agendamento neste período
              {profFilter !== "todos" || servicoFilter !== "todos" || statusFilter !== "todos" ? " com estes filtros" : ""}.
            </div>
          )}
        </div>
      </section>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o agendamento de{" "}
              <span className="font-medium text-foreground">{deleteTarget?.cliente_nome}</span>
              {deleteTarget && <> às {formatHora(deleteTarget.hora)}?</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className={cn(
                "mt-0 rounded-full border-border !bg-secondary !text-muted-foreground shadow-none",
                "hover:!bg-unavailable hover:!text-unavailable-foreground hover:!border-unavailable",
              )}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className={cn(
                "rounded-full border border-border !bg-secondary !text-muted-foreground shadow-none",
                "hover:!bg-primary hover:!text-primary-foreground hover:!border-primary",
              )}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
