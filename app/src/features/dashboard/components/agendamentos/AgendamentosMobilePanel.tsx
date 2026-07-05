import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Check, Clock, Loader2, MessageSquare, Phone, Scissors, User } from "lucide-react";
import type { RescheduleContext } from "@agenda/pages/PublicBooking";
import { supabase } from "@agenda/integrations/supabase/client";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";
import type { CaBarbearia, DashboardShop } from "@/providers/DashboardShopProvider";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  AgendamentoActionsMenu,
  AgendamentoMenuAction,
  AgendamentoMenuActionLoading,
} from "@/features/dashboard/components/agendamentos/AgendamentoActionsMenu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildAppointmentConfirmationMessage,
  buildClientWhatsAppUrl,
  getClientConfirmationBadgeForPanel,
} from "@/lib/appointmentConfirmationMessage";
import { isPastCalendarDate, isWithinAppointmentRetention } from "@agenda/lib/appointmentDates";
import { notifyPanelPacientesChanged } from "@agenda/lib/panelPacientesRefresh";
import {
  patchClienteNomeInList,
  dispatchClienteNomeSync,
  isAgendamentoClienteNomeOnlyUpdate,
  clienteNomePayloadFromAgendamentoRow,
  whatsappMatches,
} from "@agenda/lib/panelClienteNomeSync";
import { useClienteNomeSyncListener } from "@/features/dashboard/hooks/usePainelClienteNomeBroadcast";
import { AgendamentoStatusBadge } from "@/features/dashboard/components/agendamentos/AgendamentoStatusBadge";
import {
  getAppointmentStatusMenuActions,
  canManageAgendamento,
  canOpenAnotacaoConcluido,
  formatPaymentSummary,
  parsePainelRpc,
  ymd,
  type AgendamentoProfissional,
  type PastDayStatusKey,
} from "@/features/dashboard/lib/agendamentosPanel";
import {
  AgendamentoAnotacaoButton,
  AgendamentoAnotacaoModal,
} from "@/features/dashboard/components/agendamentos/AgendamentoAnotacaoModal";
import {
  panelAgendamentoErrorMessage,
  parsePanelStatusRow,
  rpcAlterarAgendamentoPainel,
  rpcAlterarStatusPassado,
  rpcConfirmarPresenca,
  rpcExcluirAgendamento,
} from "@/features/dashboard/lib/agendamentosPanelActions";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
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
  requires_client_confirmation: boolean;
  status: "confirmado" | "concluido" | "cancelado" | "nao_veio" | "aguardando_pagamento";
  valor_pago_centavos?: number | null;
  valor_restante_centavos?: number | null;
  can_manage?: boolean;
  barbeiros: { id: string; nome: string } | null;
};

type Props = {
  barbeariaId: string | null;
  caBarbearias: CaBarbearia[];
  shop: DashboardShop | null;
  allBarbeariaIds: string[];
  isCA: boolean;
  syncingAgenda: boolean;
};

function formatHora(hora: string) {
  return String(hora).slice(0, 5);
}

function formatWhatsApp(w: string) {
  const d = w.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return w;
}

export default function AgendamentosMobilePanel({
  barbeariaId,
  caBarbearias,
  shop,
  allBarbeariaIds,
  isCA,
  syncingAgenda,
}: Props) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkApplied = useRef(false);
  const [loadingList, setLoadingList] = useState(false);
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([]);
  const [profissionais, setProfissionais] = useState<AgendamentoProfissional[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [selectedBarbeiroId, setSelectedBarbeiroId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgendamentoRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingPresenceId, setConfirmingPresenceId] = useState<string | null>(null);
  const [markingNoShowId, setMarkingNoShowId] = useState<string | null>(null);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);
  const [anotacaoTarget, setAnotacaoTarget] = useState<AgendamentoRow | null>(null);

  const caBarbeariaIds = useMemo(
    () => caBarbearias.map((ca) => ca.barbeariaId).filter(Boolean),
    [caBarbearias],
  );

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
    if (!isWithinAppointmentRetention(selectedDate)) {
      setAgendamentos([]);
      setLoadingList(false);
      return;
    }
    if (!options?.preserveUi) {
      setLoadingList(true);
    }
    const { data, error } = await supabase.rpc("get_agendamentos_painel", {
      p_data_inicio: selectedDate,
      p_data_fim: selectedDate,
    });
    if (!error) {
      const parsed = parsePainelRpc(data);
      setProfissionais(parsed?.profissionais ?? []);
      setAgendamentos(
        (parsed?.items ?? []).map((item) => ({
          id: item.id,
          data: item.data,
          hora: item.hora,
          cliente_nome: item.cliente_nome,
          cliente_whatsapp: item.cliente_whatsapp,
          duracao_minutos: item.duracao_minutos,
          servicos_nomes: item.servicos_nomes ?? [],
          observacao: item.observacao,
          barbeiro_id: item.barbeiro_id,
          barbearia_id: item.barbearia_id,
          confirmation_token: item.confirmation_token,
          client_confirmed_at: item.client_confirmed_at,
          requires_client_confirmation: item.requires_client_confirmation ?? false,
          status: item.status,
          valor_pago_centavos: item.valor_pago_centavos,
          valor_restante_centavos: item.valor_restante_centavos,
          can_manage: item.can_manage,
          barbeiros: { id: item.barbeiro_id, nome: item.barbeiro_nome },
        })),
      );
    }
    setLoadingList(false);
  }, [selectedDate]);

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

  const debouncedRefresh = useDebouncedCallback(refreshAgendamentos, 400);

  useClienteNomeSyncListener((payload) => {
    setAgendamentos((prev) => patchClienteNomeInList(prev, payload));
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
        .channel(`painel-agendamentos:${bid}`)
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
            debouncedRefresh();
          },
        )
        .subscribe(),
    );
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [allBarbeariaIds, debouncedRefresh]);

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

  const colaboradoresFiltro = useMemo(() => {
    if (isCA) return profissionais;
    return barbeirosNoDia;
  }, [isCA, profissionais, barbeirosNoDia]);

  useEffect(() => {
    if (!isCA || profissionais.length === 0) return;
    setSelectedBarbeiroId((cur) =>
      cur && profissionais.some((p) => p.id === cur) ? cur : profissionais[0].id,
    );
  }, [isCA, profissionais]);

  const listaFiltrada = useMemo(() => {
    if (isCA) {
      const id = selectedBarbeiroId ?? profissionais[0]?.id;
      if (!id) return agendamentos;
      return agendamentos.filter((a) => a.barbeiro_id === id);
    }
    if (!selectedBarbeiroId) return agendamentos;
    return agendamentos.filter((a) => a.barbeiro_id === selectedBarbeiroId);
  }, [agendamentos, selectedBarbeiroId, isCA, profissionais]);

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
      if (!isCA) setSelectedBarbeiroId(null);
    } else {
      setSelectedDate(key);
      if (!isCA) {
        setSelectedBarbeiroId(null);
      } else if (profissionais[0]) {
        setSelectedBarbeiroId(profissionais[0].id);
      }
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
    const { error } = await rpcExcluirAgendamento(removedId);
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
      () => toast({ title: "Link copiado" }),
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
    const { data, error } = await rpcConfirmarPresenca(a.id);
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

  async function handlePastDayStatus(a: AgendamentoRow, novoStatus: PastDayStatusKey) {
    if (markingNoShowId || statusChangingId || !canManageAgendamento({ barbearia_id: a.barbearia_id, can_manage: a.can_manage }, barbeariaId)) return;
    setMarkingNoShowId(a.id);
    const { data, error } = await rpcAlterarStatusPassado(a.id, novoStatus);
    setMarkingNoShowId(null);
    if (error) {
      toast({ title: "Não foi possível alterar", description: panelAgendamentoErrorMessage(error.message), variant: "destructive" });
      return;
    }
    const row = parsePanelStatusRow(data);
    setAgendamentos((prev) =>
      prev.map((item) =>
        item.id === a.id
          ? {
              ...item,
              status: (row?.status as AgendamentoRow["status"]) ?? item.status,
              client_confirmed_at:
                row && "client_confirmed_at" in row ? row.client_confirmed_at ?? null : item.client_confirmed_at,
            }
          : item,
      ),
    );
    notifyPanelPacientesChanged();
  }

  async function handleStatusAction(
    a: AgendamentoRow,
    action: "confirmar" | "nao_confirmado" | "cancelar",
  ) {
    if (
      statusChangingId ||
      markingNoShowId ||
      isPastCalendarDate(a.data) ||
      !canManageAgendamento({ barbearia_id: a.barbearia_id, can_manage: a.can_manage }, barbeariaId)
    ) {
      return;
    }
    setStatusChangingId(a.id);
    const { data, error } = await rpcAlterarAgendamentoPainel(a.id, action);
    setStatusChangingId(null);
    if (error) {
      toast({ title: "Não foi possível alterar", description: panelAgendamentoErrorMessage(error.message), variant: "destructive" });
      return;
    }
    const row = parsePanelStatusRow(data);
    setAgendamentos((prev) =>
      prev.map((item) =>
        item.id === a.id
          ? {
              ...item,
              status: (row?.status as AgendamentoRow["status"]) ?? item.status,
              client_confirmed_at:
                row && "client_confirmed_at" in row ? row.client_confirmed_at ?? null : item.client_confirmed_at,
            }
          : item,
      ),
    );
    notifyPanelPacientesChanged();
    void loadAgendamentos();
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 pb-10 w-full overflow-x-hidden">
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

      {colaboradoresFiltro.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2.5">Colaboradores</h2>
          <HorizontalScrollStrip
            centerOn={
              selectedBarbeiroId || colaboradoresFiltro[0]?.id
                ? `[data-barbeiro="${selectedBarbeiroId ?? colaboradoresFiltro[0]?.id}"]`
                : null
            }
          >
            {!isCA && (
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
            )}
            {colaboradoresFiltro.map((b) => {
              const activeId = selectedBarbeiroId ?? (isCA ? colaboradoresFiltro[0]?.id : null);
              const sel = b.id === activeId;
              return (
                <button
                  key={b.id}
                  type="button"
                  data-barbeiro={b.id}
                  onClick={() => {
                    if (isCA) {
                      setSelectedBarbeiroId(b.id);
                      return;
                    }
                    setSelectedBarbeiroId(sel ? null : b.id);
                  }}
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
            {isCA && colaboradoresFiltro.length === 1
              ? `Horários — ${colaboradoresFiltro[0].nome}`
              : selectedBarbeiroId
                ? `Horários — ${colaboradoresFiltro.find((b) => b.id === selectedBarbeiroId)?.nome ?? ""}`
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
              const manageable = canManageAgendamento(
                { barbearia_id: a.barbearia_id, can_manage: a.can_manage },
                barbeariaId,
              );
              const confirmationBadge = !isCancelled && !isNoShow ? getClientConfirmationBadgeForPanel(a) : null;
              const appointmentPast = isPastCalendarDate(a.data);
              const statusMenuActions = manageable ? getAppointmentStatusMenuActions(a, a.data) : [];
              const showStatusBadge =
                a.status === "confirmado" ||
                a.status === "concluido" ||
                a.status === "nao_veio" ||
                a.status === "cancelado" ||
                a.status === "aguardando_pagamento";
              const paymentSummary = formatPaymentSummary(a);
              const showCardActions =
                !appointmentPast && manageable && a.status !== "concluido" && !isNoShow;
              const cardActionsBusy = markingNoShowId === a.id || statusChangingId === a.id;
              return (
              <li key={a.id} id={`agendamento-${a.id}`}>
                <Card
                  data-agendamento-card
                  className={cn(
                    "overflow-hidden border-border/80 transition-shadow",
                    highlightedId === a.id && "ring-2 ring-primary shadow-glow border-primary/40",
                  )}
                >
                  <CardContent className="p-4 space-y-3 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        {showStatusBadge ? (
                          <div className="flex items-center gap-1.5">
                            <AgendamentoStatusBadge
                              item={{
                                ...a,
                                barbeiro_nome: a.barbeiros?.nome ?? "",
                                requires_client_confirmation: a.requires_client_confirmation ?? false,
                              }}
                              busy={markingNoShowId === a.id || statusChangingId === a.id}
                              allowStatusChange={manageable && !appointmentPast && a.status !== "aguardando_pagamento"}
                              menuActions={statusMenuActions.length > 0 ? statusMenuActions : undefined}
                              onAction={(action) => void handleStatusAction(a, action)}
                              onMenuAction={(key) => void handlePastDayStatus(a, key)}
                            />
                            {!appointmentPast && confirmationBadge === "pending" && manageable && (
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
                            )}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-2 text-primary font-semibold tabular-nums">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span className="text-lg">{formatHora(a.hora)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {showCardActions ? (
                          <AgendamentoActionsMenu
                            disabled={cardActionsBusy}
                            compact
                            alignBottomToCard
                          >
                            {cardActionsBusy ? (
                              <AgendamentoMenuActionLoading />
                            ) : (
                              <>
                                <AgendamentoMenuAction
                                  label="Enviar link"
                                  onClick={() => handleWhatsApp(a)}
                                />
                                <AgendamentoMenuAction
                                  label="Copiar link"
                                  onClick={() => handleCopyConfirmationMessage(a)}
                                />
                                <AgendamentoMenuAction
                                  label="Alterar"
                                  onClick={() => handleAlterar(a)}
                                />
                                <AgendamentoMenuAction
                                  label="Excluir"
                                  onClick={() => setDeleteTarget(a)}
                                />
                              </>
                            )}
                          </AgendamentoActionsMenu>
                        ) : null}
                        {a.status === "concluido" && canOpenAnotacaoConcluido(a, barbeariaId, caBarbeariaIds, profissionais) ? (
                          <AgendamentoAnotacaoButton
                            disabled={markingNoShowId === a.id}
                            onClick={() => setAnotacaoTarget(a)}
                          />
                        ) : null}
                        {!selectedBarbeiroId && a.barbeiros?.nome && (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                            {a.barbeiros.nome}
                          </span>
                        )}
                        {!isCA && caBarbearias.length > 0 && a.barbearia_id !== barbeariaId && (
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                            {caBarbearias.find((ca) => ca.barbeariaId === a.barbearia_id)?.shopName ?? "CA"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm min-w-0">
                      <p className="flex items-center gap-2 font-medium min-w-0">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="min-w-0 truncate" title={a.cliente_nome}>
                          {a.cliente_nome}
                        </span>
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4 shrink-0" />
                        {formatWhatsApp(a.cliente_whatsapp)}
                      </p>
                      {a.servicos_nomes?.length > 0 && (
                        <div className="space-y-1 min-w-0">
                          <p className="flex items-center gap-2 text-foreground min-w-0">
                            <Scissors className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span
                              className="min-w-0 truncate"
                              title={a.servicos_nomes.join(" · ")}
                            >
                              {a.servicos_nomes.join(" · ")}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums pl-6">
                            {a.duracao_minutos} min no total
                          </p>
                          {paymentSummary && (
                            <p className="text-xs text-orange-700/90 dark:text-orange-300/90 pl-6">
                              {paymentSummary}
                            </p>
                          )}
                        </div>
                      )}
                      {a.observacao?.trim() && (
                        <p className="flex items-start gap-2 text-muted-foreground pt-1 border-t border-border/60">
                          <MessageSquare className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{a.observacao}</span>
                        </p>
                      )}
                    </div>
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

      <AgendamentoAnotacaoModal
        open={!!anotacaoTarget}
        agendamentoId={anotacaoTarget?.id ?? null}
        clienteNome={anotacaoTarget?.cliente_nome}
        onClose={() => setAnotacaoTarget(null)}
      />
    </div>
  );
}
