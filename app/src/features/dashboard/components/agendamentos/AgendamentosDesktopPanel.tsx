import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
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
} from "@/lib/appointmentConfirmationMessage";
import {
  filterAgendamentos,
  formatMoney,
  formatPaymentSummary,
  getPeriodRange,
  getPeriodSummaryVisibility,
  getStatusFilterOptions,
  isPastDay,
  canManageAgendamento,
  canOpenAnotacaoConcluido,
  parsePainelRpc,
  parseYmd,
  getAppointmentStatusMenuActions,
  servicesInPeriod,
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
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { AgendamentosMiniCalendar, monthStart } from "@/features/dashboard/components/agendamentos/AgendamentosMiniCalendar";
import { MinimalFilterSelect } from "@/features/dashboard/components/agendamentos/MinimalFilterSelect";
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

type Props = {
  slug: string | null;
  barbeariaId: string | null;
  caBarbearias: CaBarbearia[];
  shop: DashboardShop | null;
  allBarbeariaIds: string[];
  isCA: boolean;
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
  isCA,
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
  const profissionalId = profFilter === "todos" ? null : profFilter;
  const servico = servicoFilter === "todos" ? null : servicoFilter;

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
      p_hub_only: isCA,
      p_editable_cas_only: false,
      p_painel_visiveis: !isCA,
    });
    if (error) {
      setProfSchedules([]);
      setLoadingSchedule(false);
      return;
    }
    setProfSchedules(parseBookingProfessionals(data));
    setLoadingSchedule(false);
  }, [slug, viewMode, anchorYmd, slotGridRevision, isCA]);

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

  const profOptions = useMemo(() => {
    const opts = profissionais.map((p) => ({ value: p.id, label: p.nome }));
    if (isCA) return opts;
    return [{ value: "todos", label: "Todos" }, ...opts];
  }, [profissionais, isCA]);

  const caBarbeariaIds = useMemo(
    () => caBarbearias.map((ca) => ca.barbeariaId).filter(Boolean),
    [caBarbearias],
  );

  useEffect(() => {
    if (!isCA || profissionais.length === 0) return;
    setProfFilter((cur) =>
      cur === "todos" || !profissionais.some((p) => p.id === cur) ? profissionais[0].id : cur,
    );
  }, [isCA, profissionais]);

  const filteredList = useMemo(
    () => filterAgendamentos(items, profissionalId, servico, statusFilter),
    [items, profissionalId, servico, statusFilter],
  );

  const showDayGrid = viewMode === "dia" && profFilter === "todos" && profissionais.length > 0;
  const showDayListTimeline = viewMode === "dia" && profFilter !== "todos" && !!profissionalId;

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

  function goAgendar() {
    navigate("/app/agendar");
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
    const { error } = await rpcExcluirAgendamento(removedId);
    setDeleting(false);
    if (error) {
      toast({ title: "Não foi possível excluir", description: error.message, variant: "destructive" });
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
        <div className="flex min-h-[3.25rem] items-center py-1 text-[11px] italic text-muted-foreground/70">
          vazio
        </div>
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
        {renderActionsMenu(a)}
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 w-full overflow-hidden">
      <aside className="flex w-[280px] shrink-0 flex-col min-h-0 border-r border-border/60 bg-background overflow-hidden">
        <div className="shrink-0 space-y-4 border-b border-border/60 p-4">
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
                    ? "bg-accent text-accent-foreground shadow-sm"
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
            <p className="text-sm font-semibold capitalize text-center flex-1 leading-tight text-accent">
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
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <div className="space-y-2">
            {profissionais.length === 0 ? (
              <div className="flex w-full items-center rounded-xl border border-border/70 bg-card/60 px-3 py-2.5 text-sm">
                <span className="font-medium text-muted-foreground">Profissional</span>
              </div>
            ) : (
              <MinimalFilterSelect
                label="Profissional"
                showSelectedLabel
                value={profFilter}
                options={profOptions}
                onChange={setProfFilter}
              />
            )}
            <MinimalFilterSelect
              label="Serviço"
              value={servicoFilter}
              options={servicoOptions}
              onChange={setServicoFilter}
            />
            <MinimalFilterSelect
              label="Status"
              value={statusFilter}
              options={statusFilterOptions}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
            />
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/50 p-3 space-y-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo do período</p>
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
                <span className="font-semibold tabular-nums">{summary.aguardando_confirmacao}</span>
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
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border/60 shrink-0">
          <h1 className="text-lg font-semibold tracking-tight">Agendamentos</h1>
          <Button type="button" size="sm" className="rounded-full" onClick={() => goAgendar()}>
            <Plus className="h-4 w-4" />
            Novo agendamento
          </Button>
        </header>

        {showDayGrid && dayGrid ? (
          <div className="relative sticky top-0 z-10 shrink-0">
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
              <span className="min-w-0 truncate pl-3.5 pr-1.5">Horário</span>
              {dayGrid.columns.map((col, colIdx) => (
                <span
                  key={col.id}
                  className={cn(
                    "min-w-0 truncate border-l text-left normal-case",
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
        ) : (
          <div className={cn(LIST_HEADER_ROW, "sticky top-0 z-10 shrink-0")}>
            <span className="min-w-0 truncate">Horário</span>
            <span className="min-w-0 truncate">Cliente</span>
            <span className="min-w-0 truncate">Serviços</span>
            <span className="min-w-0 truncate">Status</span>
            <span className="min-w-0 truncate">Profissional</span>
            <span aria-hidden />
          </div>
        )}

        <div
          className={cn(
            "relative min-h-0 flex-1 overscroll-contain",
            showDayGrid ? "overflow-auto" : "overflow-y-auto",
          )}
        >
          {(loading || ((showDayGrid || showDayListTimeline) && loadingSchedule)) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!listIsEmpty ? (
            showDayGrid && dayGrid ? (
              <div className="min-w-max">
                {dayGrid.rows.map((row) => (
                  <div
                    key={`grid-${row.sortMin}`}
                    className={cn(
                      "grid w-full items-stretch border-b transition-colors hover:bg-secondary/10",
                      DAY_GRID_RULE,
                    )}
                    style={dayGridColumnsStyle(dayGrid.columns.length, dayGridColWidth)}
                  >
                    <span className="self-center py-2 pl-3.5 pr-1.5 text-sm font-semibold tabular-nums text-accent">
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
    </div>
  );
}
