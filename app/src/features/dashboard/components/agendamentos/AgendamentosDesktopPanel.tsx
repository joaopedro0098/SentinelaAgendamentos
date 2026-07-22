import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { RescheduleContext } from "@agenda/pages/PublicBooking";
import { supabase } from "@agenda/integrations/supabase/client";
import { notifyPanelPacientesChanged } from "@agenda/lib/panelPacientesRefresh";
import {
  patchClienteNomeInList,
  dispatchClienteNomeSync,
  isAgendamentoClienteNomeOnlyUpdate,
  clienteNomePayloadFromAgendamentoRow,
  whatsappMatches,
} from "@agenda/lib/panelClienteNomeSync";
import { useClienteNomeSyncListener } from "@/features/dashboard/hooks/usePainelClienteNomeBroadcast";
import {
  buildMonthDayStats,
  buildWeekDayStats,
  computeDayPeriodSlotStats,
  computeMonthPeriodSlotStats,
  computeWeekPeriodSlotStats,
  getProfDaySlotContext,
  type ProfScheduleInput,
} from "@/features/dashboard/lib/agendamentosSlotStats";
import { AgendamentosPeriodOccupancy } from "@/features/dashboard/components/agendamentos/AgendamentosPeriodOccupancy";
import { AgendamentosWeekCalendar } from "@/features/dashboard/components/agendamentos/AgendamentosWeekCalendar";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildAppointmentConfirmationMessage,
} from "@/lib/appointmentConfirmationMessage";
import {
  filterAgendamentos,
  formatMoney,
  formatPaymentSummary,
  getPeriodRange,
  getWeekRange,
  getPeriodSummaryVisibility,
  getStatusFilterOptions,
  isPastDay,
  canManageAgendamento,
  canOpenAnotacaoConcluido,
  parsePainelRpc,
  parseYmd,
  monthStart,
  getAppointmentStatusMenuActions,
  type AgendamentoPainelItem,
  type PastDayStatusKey,
  type AgendamentoPainelSummary,
  type AgendamentoProfissional,
  type StatusFilter,
  type ViewMode,
  ymd,
} from "@/features/dashboard/lib/agendamentosPanel";
import {
  panelAgendamentoErrorMessage,
  parsePanelStatusRow,
  rpcAlterarAgendamentoPainel,
  rpcAlterarStatusPassado,
  rpcExcluirAgendamento,
} from "@/features/dashboard/lib/agendamentosPanelActions";
import { broadcastConnectAppointmentUpdate } from "@agenda/lib/connectAppointmentSync";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { AgendamentosMiniCalendar } from "@/features/dashboard/components/agendamentos/AgendamentosMiniCalendar";
import { AgendamentosMonthCalendar } from "@/features/dashboard/components/agendamentos/AgendamentosMonthCalendar";
import { MinimalFilterSelect, AGENDAMENTOS_SIDEBAR_SECTION_LABEL } from "@/features/dashboard/components/agendamentos/MinimalFilterSelect";
import { AgendamentoStatusBadge } from "@/features/dashboard/components/agendamentos/AgendamentoStatusBadge";
import {
  AgendamentoActionsMenu,
  AgendamentoMenuAction,
  AgendamentoMenuActionLoading,
} from "@/features/dashboard/components/agendamentos/AgendamentoActionsMenu";
import {
  AgendamentoAnotacaoButton,
  AgendamentoAnotacaoModal,
} from "@/features/dashboard/components/agendamentos/AgendamentoAnotacaoModal";
import { usePanelAgendamentosRefresh } from "@/features/dashboard/hooks/usePanelAgendamentosRefresh";
import {
  AgendamentoSlotBookingModal,
  type SlotBookingTarget,
} from "@/features/dashboard/components/agendamentos/AgendamentoSlotBookingModal";
import { AgendamentoObservacaoViewModal } from "@/features/dashboard/components/agendamentos/AgendamentoObservacaoViewModal";
import { AgendamentoObsIndicator } from "@/features/dashboard/components/agendamentos/AgendamentoObsIndicator";
import { AgendamentoAlertIndicator } from "@/features/dashboard/components/agendamentos/AgendamentoAlertIndicator";
import { AgendamentoAlertModal } from "@/features/dashboard/components/agendamentos/AgendamentoAlertModal";
import type { SlotBookingServico } from "@/features/dashboard/lib/agendamentoSlotBooking";

type Props = {
  slug: string | null;
  barbeariaId: string | null;
  caBarbearias: CaBarbearia[];
  shop: DashboardShop | null;
  allBarbeariaIds: string[];
  isCA: boolean;
};

type BookingProfSchedule = ProfScheduleInput;

type BookingProfessionalFull = {
  id: string;
  barbearia_id: string;
  nome: string;
  slot_minutos: number;
  servicos: SlotBookingServico[];
};

type TimelineEntry =
  | { kind: "appointment"; item: AgendamentoPainelItem; sortMin: number; barbeiroId?: string }
  | { kind: "empty"; hora: string; sortMin: number; barbeiroId: string }
  | { kind: "gap"; horaInicio: string; horaFim: string; sortMin: number; barbeiroId: string };

const LIST_ROW_GRID = cn(
  "grid w-full grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.2fr)_8.5rem_6.5rem_2rem] items-center gap-x-3 px-6",
);

const LIST_HEADER_ROW = cn(
  LIST_ROW_GRID,
  "py-2 border-b border-border/40 bg-secondary/10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
);

/** Divisórias da grade diária (Todos + Dia): mais escuras no claro, mais claras no escuro. */
const DAY_GRID_RULE = cn("border-[hsl(156_10%_68%)] dark:border-[hsl(144_8%_32%)]");

const DAY_GRID_TIME_COL = "4.75rem";
const DAY_GRID_COL_WIDTH_DEFAULT = 192;
const DAY_GRID_COL_WIDTH_MIN = 128;
const DAY_GRID_COL_WIDTH_MAX = 280;

const DAY_GRID_TIME_STICKY_SHADOW = "shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.1)]";

const DAY_GRID_TIME_HEADER_STICKY = cn(
  "sticky left-0 z-20 min-w-0 truncate bg-secondary/10",
  DAY_GRID_RULE,
  "border-r",
  DAY_GRID_TIME_STICKY_SHADOW,
);

const DAY_GRID_TIME_CELL_STICKY = cn(
  "sticky left-0 z-10 min-w-0 bg-background",
  DAY_GRID_RULE,
  "border-r",
  DAY_GRID_TIME_STICKY_SHADOW,
  "group-hover:bg-secondary/10",
);

/** Cards da sidebar (Agendamentos) — destaque branco + sombra só no tema claro. */
const AGENDAMENTOS_FILTER_EMPTY_PROF = "__agendamentos_filter_empty_prof__";
const AGENDAMENTOS_FILTER_EMPTY_SERV = "__agendamentos_filter_empty_serv__";

const AGENDAMENTOS_SIDEBAR_CARD = cn(
  "rounded-2xl border border-border/35 bg-card",
  "shadow-[0_1px_3px_hsl(var(--foreground)/0.07),0_5px_16px_hsl(var(--foreground)/0.05)]",
  "dark:border-border/70 dark:bg-card/50 dark:shadow-none",
);

const AGENDAMENTOS_SIDEBAR_FILTER = cn(
  "border-border/35 bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.07),0_4px_12px_hsl(var(--foreground)/0.04)]",
  "dark:border-border/70 dark:bg-card/60 dark:shadow-none",
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

function parseServicosFromProfessionalRow(row: Record<string, unknown>): SlotBookingServico[] {
  const raw = row.servicos ?? row.barbeiro_services;
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  return list
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const s = entry as Record<string, unknown>;
      const nome = String(s.nome ?? "").trim();
      if (!nome) return null;
      return {
        id: String(s.id ?? nome),
        nome,
        duracao_minutos: Number(s.duracao_minutos ?? 30),
        preco_centavos: s.preco_centavos != null ? Number(s.preco_centavos) : undefined,
      } satisfies SlotBookingServico;
    })
    .filter((s): s is SlotBookingServico => s != null);
}

function parseBookingProfessionalsPayload(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function collectRegisteredServiceNames(
  professionals: BookingProfessionalFull[],
  visibleProfessionalIds?: Set<string>,
) {
  const set = new Set<string>();
  for (const p of professionals) {
    if (visibleProfessionalIds && !visibleProfessionalIds.has(p.id)) continue;
    for (const s of p.servicos) {
      const name = s.nome.trim();
      if (name) set.add(name);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function parseBookingProfessionals(data: unknown): BookingProfSchedule[] {
  return parseBookingProfessionalsPayload(data).map((r) => ({
    id: String(r.barbeiro_id ?? r.id ?? ""),
    slot_minutos: Number(r.slot_minutos ?? 30),
    disponibilidades: (r.disponibilidades as BookingProfSchedule["disponibilidades"]) ?? [],
    bloqueios: (r.bloqueios as BookingProfSchedule["bloqueios"]) ?? [],
  }));
}

function parseBookingProfessionalsFull(data: unknown): BookingProfessionalFull[] {
  return parseBookingProfessionalsPayload(data).map((r) => ({
    id: String(r.barbeiro_id ?? r.id ?? ""),
    barbearia_id: String(r.barbearia_id ?? ""),
    nome: String(r.nome ?? "Profissional"),
    slot_minutos: Number(r.slot_minutos ?? 30),
    servicos: parseServicosFromProfessionalRow(r),
  }));
}

function buildDayTimeline(
  dateYmd: string,
  visibleAppointments: AgendamentoPainelItem[],
  occupancyAppointments: AgendamentoPainelItem[],
  prof: BookingProfSchedule,
  barbeiroId: string,
): TimelineEntry[] {
  const context = getProfDaySlotContext(dateYmd, prof, occupancyAppointments);
  if (!context) return [];

  const { windows, livres } = context;
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

type DayGridColumn = { id: string; nome: string };
type DayGridCell = TimelineEntry | { kind: "blank" };

type DayGridRow = {
  sortMin: number;
  timeLabel: string;
  cells: Record<string, DayGridCell>;
};

function dayGridColumnsStyle(count: number, colWidthPx: number): CSSProperties {
  return { gridTemplateColumns: `${DAY_GRID_TIME_COL} repeat(${count}, ${colWidthPx}px)` };
}

function dayGridProfPad(colIndex: number) {
  return colIndex === 0 ? "pl-3.5 pr-2.5" : "px-2.5";
}

function buildDayGrid(
  anchorYmd: string,
  schedules: BookingProfSchedule[],
  profissionais: AgendamentoProfissional[],
  dayItemsAll: AgendamentoPainelItem[],
  dayItemsVisible: AgendamentoPainelItem[],
): { columns: DayGridColumn[]; rows: DayGridRow[] } {
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const scheduleIds = new Set(schedules.map((s) => s.id));
  const profById = new Map(profissionais.map((p) => [p.id, p]));

  const extraIds = new Set<string>();
  for (const item of dayItemsVisible) {
    if (!scheduleIds.has(item.barbeiro_id)) extraIds.add(item.barbeiro_id);
  }

  const columnIds: string[] = [];
  const seen = new Set<string>();
  for (const p of profissionais) {
    if (scheduleIds.has(p.id) || extraIds.has(p.id)) {
      columnIds.push(p.id);
      seen.add(p.id);
    }
  }
  for (const s of schedules) {
    if (!seen.has(s.id)) {
      columnIds.push(s.id);
      seen.add(s.id);
    }
  }
  for (const id of extraIds) {
    if (!seen.has(id)) {
      columnIds.push(id);
      seen.add(id);
    }
  }

  const columns: DayGridColumn[] = columnIds.map((id) => ({
    id,
    nome:
      profById.get(id)?.nome
      ?? dayItemsVisible.find((a) => a.barbeiro_id === id)?.barbeiro_nome
      ?? "Profissional",
  }));

  const entriesByProf = new Map<string, TimelineEntry[]>();
  for (const col of columns) {
    const prof = scheduleById.get(col.id);
    if (prof) {
      const visible = dayItemsVisible.filter((a) => a.barbeiro_id === col.id);
      const occupancy = dayItemsAll.filter((a) => a.barbeiro_id === col.id);
      entriesByProf.set(col.id, buildDayTimeline(anchorYmd, visible, occupancy, prof, col.id));
    } else {
      const visible = dayItemsVisible.filter((a) => a.barbeiro_id === col.id);
      entriesByProf.set(
        col.id,
        visible.map((item) => ({
          kind: "appointment" as const,
          item,
          sortMin: toMin(formatHora(item.hora)),
          barbeiroId: col.id,
        })),
      );
    }
  }

  const sortMins = new Set<number>();
  for (const entries of entriesByProf.values()) {
    for (const e of entries) sortMins.add(e.sortMin);
  }

  const rows: DayGridRow[] = [...sortMins].sort((a, b) => a - b).map((sortMin) => {
    const cells: Record<string, DayGridCell> = {};
    let timeLabel = toHHMM(sortMin);
    for (const col of columns) {
      const match = (entriesByProf.get(col.id) ?? []).find((e) => e.sortMin === sortMin);
      cells[col.id] = match ?? { kind: "blank" };
      if (match) {
        if (match.kind === "gap") timeLabel = `${match.horaInicio}–${match.horaFim}`;
        else if (match.kind === "empty") timeLabel = match.hora;
        else if (match.kind === "appointment") timeLabel = formatHora(match.item.hora);
      }
    }
    return { sortMin, timeLabel, cells };
  });

  return { columns, rows };
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
  isCA,
}: Props) {
  const navigate = useNavigate();
  const { slotGridRevision, permissionsRevision } = useDashboardShop();
  const [viewMode, setViewMode] = useState<ViewMode>("dia");
  const [anchorYmd, setAnchorYmd] = useState(() => ymd(new Date()));
  const [displayMonth, setDisplayMonth] = useState(() => monthStart(new Date()));
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AgendamentoPainelItem[]>([]);
  const [profissionais, setProfissionais] = useState<AgendamentoProfissional[]>([]);
  const [summary, setSummary] = useState<AgendamentoPainelSummary>({
    total: 0,
    confirmados: 0,
    concluidos: 0,
    aguardando_confirmacao: 0,
    aguardando_pagamento: 0,
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
  const [anotacaoTarget, setAnotacaoTarget] = useState<AgendamentoPainelItem | null>(null);
  const [profSchedules, setProfSchedules] = useState<BookingProfSchedule[]>([]);
  const [bookingProfessionals, setBookingProfessionals] = useState<BookingProfessionalFull[]>([]);
  const [slotBookingTarget, setSlotBookingTarget] = useState<SlotBookingTarget | null>(null);
  const [observacaoViewTarget, setObservacaoViewTarget] = useState<{
    observacao: string;
    clienteNome?: string;
  } | null>(null);
  const [alertModalTarget, setAlertModalTarget] = useState<{
    agendamentoId: string;
    clienteNome?: string;
  } | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [dayGridColWidth, setDayGridColWidth] = useState(DAY_GRID_COL_WIDTH_DEFAULT);
  const [dayGridResizing, setDayGridResizing] = useState(false);
  const dayGridResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const period = useMemo(() => getPeriodRange(viewMode, anchorYmd), [viewMode, anchorYmd]);
  const statusFilterOptions = useMemo(
    () => getStatusFilterOptions(period.startYmd, period.endYmd),
    [period.startYmd, period.endYmd],
  );
  const summaryVisibility = useMemo(
    () => getPeriodSummaryVisibility(period.startYmd, period.endYmd),
    [period.startYmd, period.endYmd],
  );
  const faltasCount = useMemo(
    () => items.filter((item) => item.status === "nao_veio").length,
    [items],
  );
  const profissionalId =
    profFilter === "todos" || profFilter === AGENDAMENTOS_FILTER_EMPTY_PROF ? null : profFilter;
  const servico =
    servicoFilter === "todos" || servicoFilter === AGENDAMENTOS_FILTER_EMPTY_SERV ? null : servicoFilter;

  useEffect(() => {
    if (!statusFilterOptions.some((o) => o.value === statusFilter)) {
      setStatusFilter("todos");
    }
  }, [statusFilter, statusFilterOptions]);

  const loadData = useCallback(async (options?: { preserveUi?: boolean }) => {
    if (!slug) {
      setItems([]);
      setProfissionais([]);
      setSummary({
        total: 0,
        confirmados: 0,
        concluidos: 0,
        aguardando_confirmacao: 0,
        aguardando_pagamento: 0,
        cancelados: 0,
        faturamento_centavos: 0,
      });
      setLoading(false);
      return;
    }
    if (!options?.preserveUi) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase.rpc("get_agendamentos_painel", {
        p_data_inicio: period.startYmd,
        p_data_fim: period.endYmd,
      });
      if (error) {
        toast({ title: "Não foi possível carregar", description: error.message, variant: "destructive" });
        return;
      }
      const parsed = parsePainelRpc(data);
      if (parsed) {
        setItems(parsed.items);
        setProfissionais(parsed.profissionais);
        setSummary(parsed.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, period.startYmd, period.endYmd]);

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

  const debouncedLoadData = useDebouncedCallback(() => {
    void loadData({ preserveUi: true });
  }, 400);

  useClienteNomeSyncListener((payload) => {
    setItems((prev) => patchClienteNomeInList(prev, payload));
    setDeleteTarget((prev) =>
      prev && whatsappMatches(prev.cliente_whatsapp, payload.whatsapp_digits)
        ? { ...prev, cliente_nome: payload.nome }
        : prev,
    );
    setAnotacaoTarget((prev) =>
      prev && whatsappMatches(prev.cliente_whatsapp, payload.whatsapp_digits)
        ? { ...prev, cliente_nome: payload.nome }
        : prev,
    );
  });

  useEffect(() => {
    if (!allBarbeariaIds.length) return;
    const channels = allBarbeariaIds.map((bid) =>
      supabase
        .channel(`painel-agendamentos-desktop:${bid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agendamentos", filter: `barbearia_id=eq.${bid}` },
          (payload) => {
            if (isAgendamentoClienteNomeOnlyUpdate(payload)) {
              const syncPayload = clienteNomePayloadFromAgendamentoRow(
                payload.new as Record<string, unknown>,
              );
              if (syncPayload) dispatchClienteNomeSync(syncPayload);
              return;
            }
            debouncedLoadData();
          },
        )
        .subscribe(),
    );
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [allBarbeariaIds, debouncedLoadData]);

  const loadProfSchedules = useCallback(async () => {
    if (!slug) {
      setProfSchedules([]);
      setBookingProfessionals([]);
      return;
    }
    if (viewMode !== "dia" && viewMode !== "semana" && viewMode !== "mes") {
      setProfSchedules([]);
      return;
    }
    const range =
      viewMode === "mes"
        ? getPeriodRange("mes", anchorYmd)
        : viewMode === "semana"
          ? getPeriodRange("semana", anchorYmd)
          : { startYmd: anchorYmd, endYmd: anchorYmd };

    setLoadingSchedule(true);
    try {
      await supabase.rpc("ensure_agenda_from_barbershop_slug", { p_slug: slug });
      const { data, error } = await supabase.rpc("get_booking_professionals", {
        p_slug: slug,
        p_from: range.startYmd,
        p_to: range.endYmd,
        p_hub_only: isCA,
        p_editable_cas_only: false,
        p_painel_visiveis: !isCA,
      });
      if (error) {
        setProfSchedules([]);
        setBookingProfessionals([]);
        return;
      }
      setProfSchedules(parseBookingProfessionals(data));
      setBookingProfessionals(parseBookingProfessionalsFull(data));
    } finally {
      setLoadingSchedule(false);
    }
  }, [slug, viewMode, anchorYmd, slotGridRevision, permissionsRevision, isCA]);

  const visibleProfIds = useMemo(() => new Set(profissionais.map((p) => p.id)), [profissionais]);

  useEffect(() => {
    void loadProfSchedules();
  }, [loadProfSchedules, visibleProfIds]);

  const debouncedLoadProfSchedules = useDebouncedCallback(() => {
    void loadProfSchedules();
  }, 400);

  useEffect(() => {
    if (!profissionais.length) return;
    const channels = profissionais.map((prof) =>
      supabase
        .channel(`painel-agendamentos-bloqueios:${prof.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bloqueios", filter: `barbeiro_id=eq.${prof.id}` },
          () => debouncedLoadProfSchedules(),
        )
        .subscribe(),
    );
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [profissionais, debouncedLoadProfSchedules]);

  useEffect(() => {
    setDisplayMonth(monthStart(parseYmd(anchorYmd)));
  }, [anchorYmd]);

  const registeredServiceNames = useMemo(
    () => collectRegisteredServiceNames(bookingProfessionals, visibleProfIds),
    [bookingProfessionals, visibleProfIds],
  );

  const servicoOptions = useMemo(() => {
    if (registeredServiceNames.length === 0) {
      return [{ value: AGENDAMENTOS_FILTER_EMPTY_SERV, label: "Não há serviço cadastrado" }];
    }
    if (registeredServiceNames.length === 1) {
      const name = registeredServiceNames[0];
      return [{ value: name, label: name }];
    }
    return [
      { value: "todos", label: "Todos" },
      ...registeredServiceNames.map((n) => ({ value: n, label: n })),
    ];
  }, [registeredServiceNames]);

  const profOptions = useMemo(() => {
    if (profissionais.length === 0) {
      return [{ value: AGENDAMENTOS_FILTER_EMPTY_PROF, label: "Não há profissional cadastrado" }];
    }
    const opts = profissionais.map((p) => ({ value: p.id, label: p.nome }));
    if (isCA) return opts;
    if (opts.length === 1) return opts;
    return [{ value: "todos", label: "Todos" }, ...opts];
  }, [profissionais, isCA]);

  const caBarbeariaIds = useMemo(
    () => caBarbearias.map((ca) => ca.barbeariaId).filter(Boolean),
    [caBarbearias],
  );

  useEffect(() => {
    if (registeredServiceNames.length === 0) {
      setServicoFilter(AGENDAMENTOS_FILTER_EMPTY_SERV);
      return;
    }
    if (registeredServiceNames.length === 1) {
      setServicoFilter(registeredServiceNames[0]);
      return;
    }
    setServicoFilter((cur) => {
      if (cur === AGENDAMENTOS_FILTER_EMPTY_SERV) return "todos";
      if (cur !== "todos" && !registeredServiceNames.includes(cur)) return "todos";
      return cur;
    });
  }, [registeredServiceNames]);

  useEffect(() => {
    if (profissionais.length === 0) {
      setProfFilter(AGENDAMENTOS_FILTER_EMPTY_PROF);
      return;
    }
    if (isCA) {
      setProfFilter((cur) =>
        cur === AGENDAMENTOS_FILTER_EMPTY_PROF || !profissionais.some((p) => p.id === cur)
          ? profissionais[0].id
          : cur,
      );
      return;
    }
    if (profissionais.length === 1) {
      setProfFilter(profissionais[0].id);
      return;
    }
    setProfFilter((cur) => {
      if (cur === AGENDAMENTOS_FILTER_EMPTY_PROF) return "todos";
      if (cur !== "todos" && !profissionais.some((p) => p.id === cur)) return "todos";
      return cur;
    });
  }, [profissionais, isCA]);

  const filteredList = useMemo(
    () => filterAgendamentos(items, profissionalId, servico, statusFilter),
    [items, profissionalId, servico, statusFilter],
  );

  const showDayGrid = viewMode === "dia" && profFilter === "todos" && profissionais.length > 0;
  const showDayListTimeline = viewMode === "dia" && profFilter !== "todos" && !!profissionalId;
  const canBookEmptySlots = viewMode === "dia" && !isPastDay(anchorYmd);
  const showMonthCalendar = viewMode === "mes";
  const showWeekCalendar = viewMode === "semana";
  const showPeriodCalendar = showMonthCalendar || showWeekCalendar;

  const monthDayStats = useMemo(
    () => buildMonthDayStats(displayMonth, profSchedules, items, profissionalId),
    [displayMonth, profSchedules, items, profissionalId],
  );

  const weekDayStats = useMemo(
    () => buildWeekDayStats(anchorYmd, profSchedules, items, profissionalId),
    [anchorYmd, profSchedules, items, profissionalId],
  );

  const periodOccupancy = useMemo(() => {
    if (viewMode === "mes") {
      return computeMonthPeriodSlotStats(displayMonth, profSchedules, items, null);
    }
    if (viewMode === "semana") {
      return computeWeekPeriodSlotStats(anchorYmd, profSchedules, items, null);
    }
    return computeDayPeriodSlotStats(anchorYmd, profSchedules, items, null);
  }, [viewMode, displayMonth, anchorYmd, profSchedules, items]);

  const periodOccupancyLabel =
    viewMode === "mes"
      ? "Ocupação do mês"
      : viewMode === "semana"
        ? "Ocupação da semana"
        : "Ocupação do dia";

  const handlePeriodDayClick = useCallback((dayYmd: string) => {
    setAnchorYmd(dayYmd);
    setViewMode("dia");
  }, []);

  const dayGrid = useMemo(() => {
    if (!showDayGrid) return null;
    const dayItemsAll = items.filter((a) => a.data === anchorYmd);
    const dayItemsVisible = filteredList.filter((a) => a.data === anchorYmd);
    return buildDayGrid(anchorYmd, profSchedules, profissionais, dayItemsAll, dayItemsVisible);
  }, [showDayGrid, profSchedules, profissionais, filteredList, items, anchorYmd]);

  const listRows = useMemo((): TimelineEntry[] => {
    if (showDayListTimeline && profissionalId) {
      const dayItemsAll = items.filter((a) => a.data === anchorYmd);
      const dayItemsVisible = filteredList.filter((a) => a.data === anchorYmd);
      const prof = profSchedules.find((p) => p.id === profissionalId);
      if (prof) {
        const visible = dayItemsVisible.filter((a) => a.barbeiro_id === profissionalId);
        const occupancy = dayItemsAll.filter((a) => a.barbeiro_id === profissionalId);
        return buildDayTimeline(anchorYmd, visible, occupancy, prof, profissionalId);
      }
      return dayItemsVisible
        .filter((a) => a.barbeiro_id === profissionalId)
        .map((item) => ({
          kind: "appointment" as const,
          item,
          sortMin: toMin(formatHora(item.hora)),
          barbeiroId: profissionalId,
        }));
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
  }, [
    showDayListTimeline,
    profissionalId,
    profSchedules,
    filteredList,
    items,
    anchorYmd,
  ]);

  const listIsEmpty =
    !showPeriodCalendar &&
    !loading &&
    !loadingSchedule &&
    (showDayGrid ? (dayGrid?.rows.length ?? 0) === 0 : listRows.length === 0);

  const handleDayGridResizeStart = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      dayGridResizeRef.current = { startX: e.clientX, startWidth: dayGridColWidth };
      setDayGridResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [dayGridColWidth],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dayGridResizeRef.current) return;
      const delta = e.clientX - dayGridResizeRef.current.startX;
      const next = Math.min(
        DAY_GRID_COL_WIDTH_MAX,
        Math.max(DAY_GRID_COL_WIDTH_MIN, dayGridResizeRef.current.startWidth + delta),
      );
      setDayGridColWidth(next);
    };
    const onUp = () => {
      if (!dayGridResizeRef.current) return;
      dayGridResizeRef.current = null;
      setDayGridResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const handleOpenSlotBooking = useCallback(
    (hora: string, barbeiroId: string) => {
      if (viewMode !== "dia" || isPastDay(anchorYmd)) return;
      const prof =
        bookingProfessionals.find((p) => p.id === barbeiroId)
        ?? (() => {
          const panelProf = profissionais.find((p) => p.id === barbeiroId);
          const schedule = profSchedules.find((p) => p.id === barbeiroId);
          if (!panelProf) return null;
          return {
            id: panelProf.id,
            barbearia_id: panelProf.barbearia_id,
            nome: panelProf.nome,
            slot_minutos: schedule?.slot_minutos ?? 30,
            servicos: [] as SlotBookingServico[],
          };
        })();
      if (!prof?.barbearia_id) {
        toast({
          title: "Não foi possível abrir o agendamento",
          description: "Dados do profissional incompletos. Atualize a página.",
          variant: "destructive",
        });
        return;
      }
      setSlotBookingTarget({
        data: anchorYmd,
        hora: formatHora(hora),
        barbeiroId,
        barbeiroNome: prof.nome,
        barbeariaId: prof.barbearia_id,
        slotMinutos: prof.slot_minutos,
        servicos: prof.servicos,
      });
    },
    [viewMode, anchorYmd, bookingProfessionals, profissionais, profSchedules],
  );

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
    const result = await rpcExcluirAgendamento(removedId);
    setDeleting(false);
    if ("error" in result) {
      toast({ title: "Não foi possível excluir", description: result.error, variant: "destructive" });
      return;
    }
    setDeleteTarget(null);
    setItems((prev) => prev.filter((a) => a.id !== removedId));
    toast({ title: "Agendamento excluído" });
    void loadData({ preserveUi: true });
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
      () => toast({ title: "Link de confirmação copiado" }),
      () => toast({ title: "Não foi possível copiar", variant: "destructive" }),
    );
  }

  function handleAlertResolved(agendamentoId: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === agendamentoId ? { ...item, has_pending_alert: false } : item)),
    );
  }

  async function handleStatusAction(
    a: AgendamentoPainelItem,
    action: "confirmar" | "nao_confirmado" | "cancelar",
  ) {
    if (statusChangingId || isPastDay(a.data) || !canManageAgendamento(a, barbeariaId)) return;
    setStatusChangingId(a.id);
    const { data, error } = await rpcAlterarAgendamentoPainel(a.id, action);
    setStatusChangingId(null);
    if (error) {
      toast({ title: "Não foi possível alterar", description: panelAgendamentoErrorMessage(error.message), variant: "destructive" });
      return;
    }
    const row = parsePanelStatusRow(data);
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
    notifyPanelPacientesChanged();
    void broadcastConnectAppointmentUpdate(supabase, a.cliente_whatsapp, a.id).catch(() => {});
  }

  async function handlePastDayStatus(a: AgendamentoPainelItem, novoStatus: PastDayStatusKey) {
    if (markingNoShowId || !canManageAgendamento(a, barbeariaId)) return;
    setMarkingNoShowId(a.id);
    const { data, error } = await rpcAlterarStatusPassado(a.id, novoStatus);
    setMarkingNoShowId(null);
    if (error) {
      toast({ title: "Não foi possível alterar", description: panelAgendamentoErrorMessage(error.message), variant: "destructive" });
      return;
    }
    const row = parsePanelStatusRow(data);
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
    notifyPanelPacientesChanged();
  }

  function caLabel(itemBarbeariaId: string) {
    return caBarbearias.find((ca) => ca.barbeariaId === itemBarbeariaId)?.shopName ?? "CA";
  }

  function renderActionsMenu(a: AgendamentoPainelItem) {
    const isNoShow = a.status === "nao_veio";
    const pastDay = isPastDay(a.data);
    const busy = statusChangingId === a.id || markingNoShowId === a.id;
    const manageable = canManageAgendamento(a, barbeariaId);

    if (a.status === "concluido") {
      if (!canOpenAnotacaoConcluido(a, barbeariaId, caBarbeariaIds, profissionais)) return null;
      return (
        <AgendamentoAnotacaoButton
          disabled={busy}
          onClick={() => setAnotacaoTarget(a)}
        />
      );
    }

    if (pastDay || !manageable) return null;

    return (
      <AgendamentoActionsMenu disabled={busy}>
        {busy ? (
          <AgendamentoMenuActionLoading />
        ) : (
          <>
            {!isNoShow && (
              <>
                <AgendamentoMenuAction label="Alterar" onClick={() => handleAlterar(a)} />
                <AgendamentoMenuAction label="Link de confirmação" onClick={() => handleCopyConfirmationMessage(a)} />
                <AgendamentoMenuAction label="Excluir" destructive onClick={() => setDeleteTarget(a)} />
              </>
            )}
          </>
        )}
      </AgendamentoActionsMenu>
    );
  }

  function renderGridAppointmentCell(a: AgendamentoPainelItem) {
    const appointmentPast = isPastDay(a.data);
    const rowBusy = statusChangingId === a.id || markingNoShowId === a.id;
    const manageable = canManageAgendamento(a, barbeariaId);
    const statusMenuActions = manageable ? getAppointmentStatusMenuActions(a, a.data) : [];
    const paymentSummary = formatPaymentSummary(a);

    const actions = renderActionsMenu(a);

    return (
      <div className="relative min-h-[3.25rem] py-2">
        <AgendamentoAlertIndicator
          show={Boolean(a.has_pending_alert)}
          className={cn("absolute top-1 z-[2]", actions ? "right-14" : "right-8")}
          onClick={() => setAlertModalTarget({ agendamentoId: a.id, clienteNome: a.cliente_nome })}
        />
        <AgendamentoObsIndicator
          observacao={a.observacao}
          className={cn("absolute top-1 z-[2]", actions ? "right-7" : "right-1")}
          onClick={() =>
            setObservacaoViewTarget({
              observacao: a.observacao!.trim(),
              clienteNome: a.cliente_nome,
            })
          }
        />
        {actions ? <div className="absolute top-0 -right-1 z-[1]">{actions}</div> : null}
        <div className="flex min-w-0 flex-col gap-1 pr-8">
          <p className="min-w-0 truncate text-sm font-medium" title={a.cliente_nome}>
            {a.cliente_nome}
          </p>
          <p
            className="min-w-0 truncate text-[11px] text-muted-foreground"
            title={a.servicos_nomes?.length ? a.servicos_nomes.join(" · ") : undefined}
          >
            {a.servicos_nomes?.length ? a.servicos_nomes.join(" · ") : "—"}
          </p>
          {paymentSummary && (
            <p className="min-w-0 truncate text-[10px] text-orange-700/90 dark:text-orange-300/90">
              {paymentSummary}
            </p>
          )}
          <AgendamentoStatusBadge
            item={a}
            busy={rowBusy}
            allowStatusChange={manageable && !appointmentPast && a.status !== "aguardando_pagamento"}
            menuActions={statusMenuActions.length > 0 ? statusMenuActions : undefined}
            onAction={(action) => void handleStatusAction(a, action)}
            onMenuAction={(key) => void handlePastDayStatus(a, key)}
          />
        </div>
      </div>
    );
  }

  function renderGridCell(cell: DayGridCell) {
    if (cell.kind === "blank") {
      return <div className="min-h-[3.25rem] bg-muted/5" />;
    }
    if (cell.kind === "gap") {
      return (
        <div className="flex min-h-[3.25rem] items-center py-1 text-[11px] italic text-muted-foreground/80">
          intervalo
        </div>
      );
    }
    if (cell.kind === "empty") {
      return (
        <button
          type="button"
          onClick={() => {
            if (!canBookEmptySlots) {
              toast({
                title: "Horário indisponível",
                description: isPastDay(anchorYmd)
                  ? "Não é possível agendar em dias passados."
                  : "Selecione o modo Dia para agendar por horário.",
                variant: "destructive",
              });
              return;
            }
            handleOpenSlotBooking(cell.hora, cell.barbeiroId);
          }}
          title={canBookEmptySlots ? "Clique para agendar" : undefined}
          className={cn(
            "flex min-h-[3.25rem] w-full items-center py-1 text-[11px] italic text-muted-foreground/70",
            canBookEmptySlots &&
              "cursor-pointer transition-colors hover:bg-available/10 hover:text-available",
            !canBookEmptySlots && "cursor-not-allowed opacity-60",
          )}
        >
          vazio
        </button>
      );
    }
    return renderGridAppointmentCell(cell.item);
  }

  function renderAppointmentRow(a: AgendamentoPainelItem) {
    const showDate = viewMode !== "dia";
    const appointmentPast = isPastDay(a.data);
    const rowBusy = statusChangingId === a.id || markingNoShowId === a.id;
    const manageable = canManageAgendamento(a, barbeariaId);
    const statusMenuActions = manageable ? getAppointmentStatusMenuActions(a, a.data) : [];
    const paymentSummary = formatPaymentSummary(a);

    return (
      <div
        key={a.id}
        className={cn(LIST_ROW_GRID, "py-2.5 border-b border-border/60 hover:bg-secondary/20 transition-colors")}
      >
        <span className="min-w-0 text-sm font-semibold tabular-nums text-accent">
          {showDate ? (
            <>
              {parseYmd(a.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              <span className="text-muted-foreground font-normal mx-1">·</span>
            </>
          ) : null}
          {formatHora(a.hora)}
        </span>
        <span className="block min-w-0 text-sm font-medium truncate" title={a.cliente_nome}>
          {a.cliente_nome}
        </span>
        <span
          className="block min-w-0 text-sm text-muted-foreground truncate"
          title={a.servicos_nomes?.length ? a.servicos_nomes.join(" · ") : undefined}
        >
          {a.servicos_nomes?.length ? a.servicos_nomes.join(" · ") : "—"}
          {paymentSummary && (
            <span className="block text-[11px] text-orange-700/90 dark:text-orange-300/90 truncate">
              {paymentSummary}
            </span>
          )}
        </span>
        <AgendamentoStatusBadge
          item={a}
          busy={rowBusy}
          allowStatusChange={manageable && !appointmentPast && a.status !== "aguardando_pagamento"}
          menuActions={statusMenuActions.length > 0 ? statusMenuActions : undefined}
          onAction={(action) => void handleStatusAction(a, action)}
          onMenuAction={(key) => void handlePastDayStatus(a, key)}
        />
        <div className="min-w-0 flex flex-col items-start gap-0.5">
          <span className="text-xs font-medium truncate text-accent/90">{a.barbeiro_nome}</span>
          {!isCA && caBarbearias.length > 0 && a.barbearia_id !== barbeariaId && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground truncate max-w-full">
              {caLabel(a.barbearia_id)}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <AgendamentoAlertIndicator
            show={Boolean(a.has_pending_alert)}
            onClick={() => setAlertModalTarget({ agendamentoId: a.id, clienteNome: a.cliente_nome })}
          />
          <AgendamentoObsIndicator
            observacao={a.observacao}
            onClick={() =>
              setObservacaoViewTarget({
                observacao: a.observacao!.trim(),
                clienteNome: a.cliente_nome,
              })
            }
          />
          {renderActionsMenu(a)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 w-full overflow-hidden">
      <aside className="flex w-[280px] shrink-0 flex-col min-h-0 border-r border-[hsl(156_10%_55%)] dark:border-border/60 bg-panel-canvas dark:bg-background overflow-hidden">
        <div className="shrink-0 space-y-3 border-b border-border/60 p-4">
          <AgendamentosMiniCalendar
            className={AGENDAMENTOS_SIDEBAR_CARD}
            viewMode={viewMode}
            anchorYmd={anchorYmd}
            onAnchorChange={setAnchorYmd}
            onMonthChange={(delta) => {
              if (viewMode === "mes") {
                setAnchorYmd((cur) => shiftAnchor("mes", cur, delta));
              } else {
                setDisplayMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
              }
            }}
            displayMonth={displayMonth}
          />

          <div className={cn("flex p-0.5", AGENDAMENTOS_SIDEBAR_CARD, "dark:bg-card/40")}>
            {(["dia", "semana", "mes"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex-1 rounded-lg py-2 text-xs font-semibold capitalize transition-colors",
                  viewMode === mode
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/50",
                )}
              >
                {mode === "dia" ? "Dia" : mode === "semana" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <div className="space-y-3">
            <MinimalFilterSelect
              label="Profissional"
              fieldLabel="Profissionais"
              showSelectedLabel
              emptyState={profissionais.length === 0}
              value={profFilter}
              options={profOptions}
              onChange={setProfFilter}
              triggerClassName={AGENDAMENTOS_SIDEBAR_FILTER}
            />
            <MinimalFilterSelect
              label="Serviço"
              fieldLabel="Serviços"
              showSelectedLabel
              emptyState={registeredServiceNames.length === 0}
              value={servicoFilter}
              options={servicoOptions}
              onChange={setServicoFilter}
              triggerClassName={AGENDAMENTOS_SIDEBAR_FILTER}
            />
            <MinimalFilterSelect
              label="Status"
              fieldLabel="Status"
              showSelectedLabel
              value={statusFilter}
              options={statusFilterOptions}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              triggerClassName={AGENDAMENTOS_SIDEBAR_FILTER}
            />
          </div>

          <div>
            <p className={AGENDAMENTOS_SIDEBAR_SECTION_LABEL}>Resumo do período</p>
            <div className={cn("p-3 space-y-2 text-sm", AGENDAMENTOS_SIDEBAR_CARD)}>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">{summary.total}</span>
            </div>
            {summaryVisibility.confirmados && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmados</span>
                <span className="font-semibold tabular-nums text-available">{summary.confirmados}</span>
              </div>
            )}
            {summaryVisibility.concluidos && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Concluídos</span>
                <span className="font-semibold tabular-nums text-completed">{summary.concluidos ?? 0}</span>
              </div>
            )}
            {summaryVisibility.aguardando_confirmacao && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Não confirmado</span>
                <span className="font-semibold tabular-nums text-yellow-700 dark:text-yellow-300">
                  {summary.aguardando_confirmacao}
                </span>
              </div>
            )}
            {summaryVisibility.aguardando_pagamento && (summary.aguardando_pagamento ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Aguardando pagamento</span>
                <span className="font-semibold tabular-nums text-orange-600 dark:text-orange-300">
                  {summary.aguardando_pagamento}
                </span>
              </div>
            )}
            {summaryVisibility.cancelados && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancelados</span>
                <span className="font-semibold tabular-nums text-unavailable">{summary.cancelados}</span>
              </div>
            )}
            {summaryVisibility.faltas && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Faltas</span>
                <span className="font-semibold tabular-nums text-absent">{faltasCount}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-border/60">
              <span className="text-muted-foreground">Faturamento</span>
              <span className="font-semibold tabular-nums">{formatMoney(summary.faturamento_centavos)}</span>
            </div>
            </div>
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex items-center justify-between gap-3 border-b border-border/60 bg-panel-canvas px-6 py-4 shrink-0 dark:bg-background">
          <h1 className="text-lg font-semibold tracking-tight">Agendamentos</h1>
          <AgendamentosPeriodOccupancy stats={periodOccupancy} label={periodOccupancyLabel} />
        </header>

        {!showDayGrid && viewMode !== "mes" && viewMode !== "semana" ? (
          <div className={cn(LIST_HEADER_ROW, "sticky top-0 z-10 shrink-0")}>
            <span className="min-w-0 truncate">Horário</span>
            <span className="min-w-0 truncate">Cliente</span>
            <span className="min-w-0 truncate">Serviços</span>
            <span className="min-w-0 truncate">Status</span>
            <span className="min-w-0 truncate">Profissional</span>
            <span aria-hidden />
          </div>
        ) : null}

        <div
          className={cn(
            "relative min-h-0 flex-1 overscroll-contain",
            showDayGrid ? "overflow-auto" : "overflow-y-auto",
          )}
        >
          {(loading || ((showDayGrid || showDayListTimeline || showPeriodCalendar) && loadingSchedule)) && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {showWeekCalendar ? (
            <AgendamentosWeekCalendar
              anchorYmd={anchorYmd}
              dayStats={weekDayStats}
              selectedDayYmd={anchorYmd}
              onDayClick={handlePeriodDayClick}
            />
          ) : showMonthCalendar ? (
            <AgendamentosMonthCalendar
              displayMonth={displayMonth}
              dayStats={monthDayStats}
              selectedDayYmd={anchorYmd}
              onDayClick={handlePeriodDayClick}
            />
          ) : !listIsEmpty ? (
            showDayGrid && dayGrid ? (
              <div className="min-w-max">
                <div className="relative sticky top-0 z-10 shrink-0 bg-background">
                  <button
                    type="button"
                    aria-label="Ajustar largura das colunas da grade"
                    className={cn(
                      "absolute top-1.5 z-20 h-2.5 w-2.5 -translate-x-1/2 rounded-full border bg-background shadow-sm cursor-col-resize",
                      DAY_GRID_RULE,
                      "hover:scale-110 hover:bg-secondary/80",
                      dayGridResizing && "scale-110 bg-secondary",
                    )}
                    style={{ left: `calc(${DAY_GRID_TIME_COL} + ${dayGridColWidth}px)` }}
                    onMouseDown={handleDayGridResizeStart}
                  />
                  <div
                    className={cn(
                      "grid w-full min-w-max items-center border-b bg-secondary/10 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                      DAY_GRID_RULE,
                    )}
                    style={dayGridColumnsStyle(dayGrid.columns.length, dayGridColWidth)}
                  >
                    <span className={cn("pl-3.5 pr-1.5", DAY_GRID_TIME_HEADER_STICKY)}>Horário</span>
                    {dayGrid.columns.map((col, colIdx) => (
                      <span
                        key={col.id}
                        className={cn(
                          "min-w-0 truncate border-l text-left uppercase",
                          DAY_GRID_RULE,
                          dayGridProfPad(colIdx),
                          colIdx === dayGrid.columns.length - 1 && "border-r",
                        )}
                        title={col.nome}
                      >
                        {col.nome}
                      </span>
                    ))}
                  </div>
                </div>
                {dayGrid.rows.map((row) => (
                  <div
                    key={`grid-${row.sortMin}`}
                    className={cn(
                      "group grid w-full items-stretch border-b transition-colors hover:bg-secondary/10",
                      DAY_GRID_RULE,
                    )}
                    style={dayGridColumnsStyle(dayGrid.columns.length, dayGridColWidth)}
                  >
                    <span
                      className={cn(
                        "self-center py-2 pl-3.5 pr-1.5 text-sm font-semibold tabular-nums text-accent",
                        DAY_GRID_TIME_CELL_STICKY,
                      )}
                    >
                      {row.timeLabel}
                    </span>
                    {dayGrid.columns.map((col, colIdx) => (
                      <div
                        key={`${row.sortMin}-${col.id}`}
                        className={cn(
                          "border-l",
                          DAY_GRID_RULE,
                          dayGridProfPad(colIdx),
                          colIdx === dayGrid.columns.length - 1 && "border-r",
                        )}
                      >
                        {renderGridCell(row.cells[col.id])}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
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
                    <button
                      type="button"
                      key={`empty-${row.barbeiroId}-${row.hora}-${idx}`}
                      onClick={() => {
                        if (!canBookEmptySlots) {
                          toast({
                            title: "Horário indisponível",
                            description: isPastDay(anchorYmd)
                              ? "Não é possível agendar em dias passados."
                              : "Selecione o modo Dia para agendar por horário.",
                            variant: "destructive",
                          });
                          return;
                        }
                        handleOpenSlotBooking(row.hora, row.barbeiroId);
                      }}
                      title={canBookEmptySlots ? "Clique para agendar" : undefined}
                      className={cn(
                        LIST_ROW_GRID,
                        "w-full border-b border-border/40 py-1 text-left",
                        canBookEmptySlots &&
                          "cursor-pointer transition-colors hover:bg-available/10",
                        !canBookEmptySlots && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <span className="min-w-0 text-sm tabular-nums text-muted-foreground">{row.hora}</span>
                      <span
                        className={cn(
                          "min-w-0 text-[11px] italic text-muted-foreground/70",
                          canBookEmptySlots && "hover:text-available",
                        )}
                      >
                        vazio
                      </span>
                      <span aria-hidden />
                      <span aria-hidden />
                      <span aria-hidden />
                      <span aria-hidden />
                    </button>
                  );
                }
                return renderAppointmentRow(row.item);
              })}
            </div>
            )
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

      <AgendamentoAnotacaoModal
        open={!!anotacaoTarget}
        agendamentoId={anotacaoTarget?.id ?? null}
        clienteNome={anotacaoTarget?.cliente_nome}
        onClose={() => setAnotacaoTarget(null)}
      />

      <AgendamentoSlotBookingModal
        open={!!slotBookingTarget}
        target={slotBookingTarget}
        onClose={() => setSlotBookingTarget(null)}
        onCreated={() => void loadData({ preserveUi: true })}
      />

      <AgendamentoObservacaoViewModal
        open={!!observacaoViewTarget}
        observacao={observacaoViewTarget?.observacao ?? null}
        clienteNome={observacaoViewTarget?.clienteNome}
        onClose={() => setObservacaoViewTarget(null)}
      />

      <AgendamentoAlertModal
        open={!!alertModalTarget}
        agendamentoId={alertModalTarget?.agendamentoId ?? null}
        clienteNome={alertModalTarget?.clienteNome}
        onClose={() => setAlertModalTarget(null)}
        onResolved={handleAlertResolved}
      />
    </div>
  );
}
