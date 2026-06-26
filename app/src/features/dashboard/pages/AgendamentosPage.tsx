import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Check, Clock, Copy, Loader2, MessageSquare, Pencil, Phone, Scissors, Trash2, User, X } from "lucide-react";
import type { RescheduleContext } from "@agenda/pages/PublicBooking";
import { supabase } from "@agenda/integrations/supabase/client";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";
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
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildAppointmentConfirmationMessage,
  buildClientWhatsAppUrl,
  getClientConfirmationBadgeForPanel,
} from "@/lib/appointmentConfirmationMessage";
import { DashboardPageSkeleton } from "@/components/layout/AppBootSkeleton";
import { isPastCalendarDate, isWithinAppointmentRetention } from "@agenda/lib/appointmentDates";
import AgendamentosDesktopPanel from "@/features/dashboard/components/agendamentos/AgendamentosDesktopPanel";
import { usePanelAgendamentosRefresh } from "@/features/dashboard/hooks/usePanelAgendamentosRefresh";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const DAYS_BACK = 7;
const DAYS_AHEAD = 14;

type AgendamentoRow = {
  id: string;
  data: string;
  hora: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  duracao_minutos: number;
  servicos_nomes: string[];
  observacao: string | null;
  barbeiro_id: string;
  barbearia_id: string;
  confirmation_token: string;
  client_confirmed_at: string | null;
  status: "confirmado" | "cancelado" | "concluido" | "nao_veio";
  barbeiros: { id: string; nome: string } | null;
};

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function formatHora(hora: string) {
  return String(hora).slice(0, 5);
}

function formatWhatsApp(w: string) {
  const d = w.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return w;
}

export default function AgendamentosPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { slug, barbeariaId, caBarbearias, shop, loading: shopLoading } = useDashboardShop();

  // Todos os IDs de barbearia que o usuário pode ver (própria + CAs ativas)
  const allBarbeariaIds = useMemo(() => {
    const ids: string[] = [];
    if (barbeariaId) ids.push(barbeariaId);
    for (const ca of caBarbearias) {
      if (ca.barbeariaId && !ids.includes(ca.barbeariaId)) ids.push(ca.barbeariaId);
    }
    return ids;
  }, [barbeariaId, caBarbearias]);
  const deepLinkApplied = useRef(false);
  const [loadingList, setLoadingList] = useState(false);
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [selectedBarbeiroId, setSelectedBarbeiroId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgendamentoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingPresenceId, setConfirmingPresenceId] = useState<string | null>(null);
  const [markingNoShowId, setMarkingNoShowId] = useState<string | null>(null);

  const booting = shopLoading && !slug;
  const syncingAgenda = Boolean(slug && !barbeariaId);

  const dias = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const total = DAYS_BACK + DAYS_AHEAD + 1;
    const list = Array.from({ length: total }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - DAYS_BACK + i);
      return d;
    });

    if (focusDate && /^\d{4}-\d{2}-\d{2}$/.test(focusDate) && isWithinAppointmentRetention(focusDate)) {
      const exists = list.some((d) => ymd(d) === focusDate);
      if (!exists) {
        list.push(new Date(`${focusDate}T12:00:00`));
        list.sort((a, b) => a.getTime() - b.getTime());
      }
    }

    return list;
  }, [focusDate]);

  useEffect(() => {
    document.title = "Agendamentos - Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (deepLinkApplied.current) return;

    const data = searchParams.get("data");
    const barbeiro = searchParams.get("barbeiro");
    const agendamento = searchParams.get("agendamento");
    if (!data && !barbeiro && !agendamento) return;

    if (data && /^\d{4}-\d{2}-\d{2}$/.test(data) && isWithinAppointmentRetention(data)) {
      setSelectedDate(data);
      setFocusDate(data);
    }
    if (barbeiro) setSelectedBarbeiroId(barbeiro);
    if (agendamento) setHighlightedId(agendamento);

    deepLinkApplied.current = true;
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadAgendamentos = useCallback(async (options?: { preserveUi?: boolean }) => {
    if (!allBarbeariaIds.length || !isWithinAppointmentRetention(selectedDate)) {
      setAgendamentos([]);
      setLoadingList(false);
      return;
    }
    if (!options?.preserveUi) {
      setLoadingList(true);
    }
    const { data, error } = await supabase
      .from("agendamentos")
      .select(
        "id, data, hora, cliente_nome, cliente_whatsapp, duracao_minutos, servicos_nomes, observacao, barbeiro_id, barbearia_id, confirmation_token, client_confirmed_at, status, barbeiros ( id, nome )",
      )
      .in("barbearia_id", allBarbeariaIds)
      .eq("data", selectedDate)
      .in("status", ["confirmado", "cancelado", "nao_veio"])
      .order("hora", { ascending: true });

    if (!error) {
      setAgendamentos(
        (data ?? []).map((row) => ({
          ...row,
          servicos_nomes: row.servicos_nomes ?? [],
        })) as AgendamentoRow[],
      );
    }
    setLoadingList(false);
  }, [allBarbeariaIds, selectedDate]);

  const refreshAgendamentos = useCallback(() => {
    void loadAgendamentos({ preserveUi: true });
  }, [loadAgendamentos]);

  useEffect(() => {
    loadAgendamentos();
  }, [loadAgendamentos]);

  const handlePanelRefresh = useCallback(
    (detail?: { data?: string }) => {
      if (detail?.data) {
        setSelectedDate(detail.data);
        setFocusDate(detail.data);
        if (detail.data !== selectedDate) return;
      }
      refreshAgendamentos();
    },
    [refreshAgendamentos, selectedDate],
  );

  usePanelAgendamentosRefresh(handlePanelRefresh);

  useEffect(() => {
    if (!allBarbeariaIds.length) return;
    // Um canal por barbearia (própria + CAs)
    const channels = allBarbeariaIds.map((bid) =>
      supabase
        .channel(`painel-agendamentos:${bid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "agendamentos", filter: `barbearia_id=eq.${bid}` },
          () => {
            refreshAgendamentos();
          },
        )
        .subscribe(),
    );
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [allBarbeariaIds, refreshAgendamentos]);

  const barbeirosNoDia = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agendamentos) {
      const nome = a.barbeiros?.nome ?? "Colaborador";
      map.set(a.barbeiro_id, nome);
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [agendamentos]);

  const listaFiltrada = useMemo(() => {
    if (!selectedBarbeiroId) return agendamentos;
    return agendamentos.filter((a) => a.barbeiro_id === selectedBarbeiroId);
  }, [agendamentos, selectedBarbeiroId]);

  useEffect(() => {
    if (!highlightedId || loadingList) return;

    const timer = window.setTimeout(() => {
      document.getElementById(`agendamento-${highlightedId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 120);

    const clearTimer = window.setTimeout(() => setHighlightedId(null), 8000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightedId, loadingList, listaFiltrada]);

  const dataLabel = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  }, [selectedDate]);

  const isPastDay = isPastCalendarDate(selectedDate);

  function handleDayClick(key: string) {
    if (key === selectedDate) {
      setSelectedBarbeiroId(null);
    } else {
      setSelectedDate(key);
      setSelectedBarbeiroId(null);
    }
  }

  function handleAlterar(a: AgendamentoRow) {
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
    setAgendamentos((prev) => prev.filter((a) => a.id !== removedId));
    toast({ title: "Agendamento excluído" });
    refreshAgendamentos();
  }

  function buildMessage(a: AgendamentoRow) {
    return buildAppointmentConfirmationMessage({
      ...a,
      shop_name: shop?.display_name ?? null,
    });
  }

  function handleCopyConfirmationMessage(a: AgendamentoRow) {
    const text = buildMessage(a);
    void navigator.clipboard.writeText(text).then(
      () => toast({ title: "Mensagem copiada" }),
      () => toast({ title: "Não foi possível copiar", variant: "destructive" }),
    );
  }

  function handleWhatsApp(a: AgendamentoRow) {
    const message = buildMessage(a);
    const url = buildClientWhatsAppUrl(a.cliente_whatsapp, message);
    if (!url) {
      toast({ title: "WhatsApp inválido", description: "Verifique o número do cliente.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleConfirmPresence(a: AgendamentoRow) {
    if (confirmingPresenceId) return;
    setConfirmingPresenceId(a.id);
    const { data, error } = await supabase.rpc("confirmar_presenca_agendamento_painel", {
      p_agendamento_id: a.id,
    });
    setConfirmingPresenceId(null);
    if (error) {
      toast({ title: "Não foi possível confirmar", description: error.message, variant: "destructive" });
      return;
    }
    const confirmedAt = typeof data === "string" ? data : new Date().toISOString();
    setAgendamentos((prev) =>
      prev.map((row) => (row.id === a.id ? { ...row, client_confirmed_at: confirmedAt } : row)),
    );
  }

  async function handleMarkNoShow(a: AgendamentoRow) {
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
    setAgendamentos((prev) =>
      prev.map((row) => (row.id === a.id ? { ...row, status: "nao_veio" } : row)),
    );
  }

  async function handleRevertNoShow(a: AgendamentoRow) {
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
    setAgendamentos((prev) =>
      prev.map((row) => (row.id === a.id ? { ...row, status: "confirmado" } : row)),
    );
  }

  if (booting) {
    return <DashboardPageSkeleton />;
  }

  if (!slug) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <header className="mb-6 pr-12">
          <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure sua empresa em Configurações para ver os agendamentos aqui.
          </p>
        </header>
        <ButtonLink to="/app/settings">Ir para Configurações</ButtonLink>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <AgendamentosDesktopPanel
          slug={slug}
          barbeariaId={barbeariaId}
          caBarbearias={caBarbearias}
          shop={shop}
          allBarbeariaIds={allBarbeariaIds}
        />
      </div>
      <div className="md:hidden p-4 md:p-6 max-w-3xl mx-auto space-y-6 pb-10 w-full overflow-x-hidden">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-primary" />
          Agendamentos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agendamentos feitos pelo link público ou pelo painel. Atualização automática.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold mb-2.5">Selecione o dia</h2>
        <HorizontalScrollStrip centerOn={`[data-day="${selectedDate}"]`}>
          {dias.map((d) => {
            const key = ymd(d);
            const sel = key === selectedDate;
            const isToday = key === ymd(new Date());
            return (
              <button
                key={key}
                type="button"
                data-day={key}
                onClick={() => handleDayClick(key)}
                className={cn(
                  "snap-start shrink-0 w-[68px] h-20 rounded-2xl flex flex-col items-center justify-center font-semibold transition-all active:scale-95",
                  sel
                    ? "bg-primary text-primary-foreground shadow-glow ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
              >
                <span className="text-[11px] opacity-90 font-medium">{DIAS[d.getDay()]}</span>
                <span className="font-display text-xl leading-none my-0.5">{d.getDate()}</span>
                <span className="text-[10px] opacity-80">{MESES[d.getMonth()]}</span>
                {isToday && !sel && (
                  <span className="text-[9px] mt-0.5 font-medium text-primary">Hoje</span>
                )}
              </button>
            );
          })}
        </HorizontalScrollStrip>
        <p className="mt-3 text-sm text-muted-foreground capitalize">{dataLabel}</p>
      </section>

      {barbeirosNoDia.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2.5">Colaboradores</h2>
          <HorizontalScrollStrip centerOn={selectedBarbeiroId ? `[data-barbeiro="${selectedBarbeiroId}"]` : null}>
            <button
              type="button"
              onClick={() => setSelectedBarbeiroId(null)}
              className={cn(
                "snap-start shrink-0 px-4 h-11 rounded-full text-sm font-semibold transition-all",
                selectedBarbeiroId === null
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              Todos
            </button>
            {barbeirosNoDia.map((b) => {
              const sel = b.id === selectedBarbeiroId;
              return (
                <button
                  key={b.id}
                  type="button"
                  data-barbeiro={b.id}
                  onClick={() => setSelectedBarbeiroId(sel ? null : b.id)}
                  className={cn(
                    "snap-start shrink-0 min-w-[7rem] px-4 h-11 rounded-full text-sm font-semibold transition-all",
                    sel
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  {b.nome}
                </button>
              );
            })}
          </HorizontalScrollStrip>
        </section>
      )}

      <section className="relative space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {selectedBarbeiroId
              ? `Horários — ${barbeirosNoDia.find((b) => b.id === selectedBarbeiroId)?.nome ?? ""}`
              : "Todos os agendamentos do dia"}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {listaFiltrada.length} {listaFiltrada.length === 1 ? "agendamento" : "agendamentos"}
          </span>
        </div>

        {(loadingList || syncingAgenda) && agendamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            {syncingAgenda && !loadingList ? (
              <p className="text-xs text-muted-foreground">Preparando agenda…</p>
            ) : null}
          </div>
        ) : listaFiltrada.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum agendamento para este dia
              {selectedBarbeiroId ? " com este colaborador" : ""}.
            </CardContent>
          </Card>
        ) : (
          <div className="relative">
            {loadingList && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/40 backdrop-blur-[1px]">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <ul className="space-y-3">
            {listaFiltrada.map((a) => {
              const isCancelled = a.status === "cancelado";
              const isNoShow = a.status === "nao_veio";
              const confirmationBadge = !isCancelled && !isNoShow ? getClientConfirmationBadgeForPanel(a) : null;
              return (
              <li key={a.id} id={`agendamento-${a.id}`}>
                <Card
                  className={cn(
                    "overflow-hidden border-border/80 transition-shadow",
                    highlightedId === a.id && "ring-2 ring-primary shadow-glow border-primary/40",
                  )}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        {isCancelled && (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border bg-unavailable/25 text-unavailable border-unavailable/90 dark:text-red-100">
                            Cancelado
                          </span>
                        )}
                        {isNoShow && isPastDay && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border bg-unavailable/25 text-unavailable border-unavailable/90 dark:text-red-100">
                              Faltou
                            </span>
                            <button
                              type="button"
                              aria-label="Reverter para confirmado"
                              disabled={markingNoShowId === a.id}
                              onClick={() => void handleRevertNoShow(a)}
                              className={cn(
                                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                "border-available/90 text-available hover:bg-available/15 active:bg-available/25",
                                "disabled:opacity-50 disabled:pointer-events-none",
                              )}
                            >
                              {markingNoShowId === a.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                              )}
                            </button>
                          </div>
                        )}
                        {!isNoShow && isPastDay && a.status === "confirmado" && confirmationBadge && (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border",
                                confirmationBadge === "pending" &&
                                  "bg-yellow-400/25 text-yellow-950 border-yellow-500/90 dark:text-yellow-100",
                                confirmationBadge === "confirmed" &&
                                  "bg-available/25 text-available border-available/90",
                              )}
                            >
                              {confirmationBadge === "pending" ? "Não confirmado" : "Confirmado"}
                            </span>
                            <button
                              type="button"
                              aria-label="Marcar como faltou"
                              disabled={markingNoShowId === a.id}
                              onClick={() => void handleMarkNoShow(a)}
                              className={cn(
                                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                "border-unavailable/90 text-unavailable hover:bg-unavailable/15 active:bg-unavailable/25",
                                "disabled:opacity-50 disabled:pointer-events-none",
                              )}
                            >
                              {markingNoShowId === a.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5 stroke-[2.5]" />
                              )}
                            </button>
                          </div>
                        )}
                        {confirmationBadge && !isPastDay && (
                          confirmationBadge === "pending" ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border",
                                  "bg-yellow-400/25 text-yellow-950 border-yellow-500/90 dark:text-yellow-100",
                                )}
                              >
                                Não confirmado
                              </span>
                              <button
                                type="button"
                                aria-label="Confirmar presença"
                                disabled={confirmingPresenceId === a.id}
                                onClick={() => void handleConfirmPresence(a)}
                                className={cn(
                                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                  "border-available/90 text-available hover:bg-available/15 active:bg-available/25",
                                  "disabled:opacity-50 disabled:pointer-events-none",
                                )}
                              >
                                {confirmingPresenceId === a.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide border",
                                confirmationBadge === "pending" &&
                                  "bg-yellow-400/25 text-yellow-950 border-yellow-500/90 dark:text-yellow-100",
                                confirmationBadge === "confirmed" &&
                                  "bg-available/25 text-available border-available/90",
                              )}
                            >
                              {confirmationBadge === "pending" ? "Não confirmado" : "Confirmado"}
                            </span>
                          )
                        )}
                        <div className="flex items-center gap-2 text-primary font-semibold tabular-nums">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span className="text-lg">{formatHora(a.hora)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {!selectedBarbeiroId && a.barbeiros?.nome && (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                            {a.barbeiros.nome}
                          </span>
                        )}
                        {caBarbearias.length > 0 && a.barbearia_id !== barbeariaId && (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                            {caBarbearias.find((ca) => ca.barbeariaId === a.barbearia_id)?.shopName ?? "CA"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <p className="flex items-center gap-2 font-medium">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        {a.cliente_nome}
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4 shrink-0" />
                        {formatWhatsApp(a.cliente_whatsapp)}
                      </p>
                      {a.servicos_nomes?.length > 0 && (
                        <div className="space-y-1">
                          <p className="flex items-start gap-2 text-foreground">
                            <Scissors className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            <span>{a.servicos_nomes.join(" · ")}</span>
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums pl-6">
                            {a.duracao_minutos} min no total
                          </p>
                        </div>
                      )}
                      {a.observacao?.trim() && (
                        <p className="flex items-start gap-2 text-muted-foreground pt-1 border-t border-border/60">
                          <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{a.observacao}</span>
                        </p>
                      )}
                    </div>
                    {!isPastDay && !isCancelled && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-full border-available/40 text-available hover:bg-available/10 hover:text-available"
                          onClick={() => handleWhatsApp(a)}
                        >
                          <MessageSquare className="h-4 w-4" />
                          WhatsApp
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-full"
                          onClick={() => handleCopyConfirmationMessage(a)}
                        >
                          <Copy className="h-4 w-4" />
                          Copiar
                        </Button>
                      </div>
                      <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 rounded-full"
                        onClick={() => handleAlterar(a)}
                      >
                        <Pencil className="h-4 w-4" />
                        Alterar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "flex-1 rounded-full text-foreground",
                          "hover:bg-unavailable hover:text-unavailable-foreground hover:border-unavailable",
                          "active:bg-unavailable active:text-unavailable-foreground active:border-unavailable",
                        )}
                        onClick={() => setDeleteTarget(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                      </div>
                    </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
            })}
          </ul>
          </div>
        )}
      </section>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o agendamento de{" "}
              <span className="font-medium text-foreground">{deleteTarget?.cliente_nome}</span>
              {deleteTarget && (
                <>
                  {" "}
                  às {formatHora(deleteTarget.hora)}?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className={cn(
                "mt-0 rounded-full border-border !bg-secondary !text-muted-foreground shadow-none",
                "hover:!bg-unavailable hover:!text-unavailable-foreground hover:!border-unavailable",
                "active:!bg-unavailable active:!text-unavailable-foreground active:!border-unavailable",
              )}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className={cn(
                "rounded-full border border-border !bg-secondary !text-muted-foreground shadow-none",
                "hover:!bg-primary hover:!text-primary-foreground hover:!border-primary",
                "active:!bg-primary active:!text-primary-foreground active:!border-primary",
              )}
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </>
  );
}

function ButtonLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-90 transition"
    >
      {children}
    </Link>
  );
}
