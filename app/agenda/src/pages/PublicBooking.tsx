import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { maskPhone, unmaskPhone, isValidPhone, whatsappHref } from "@/lib/phone";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Scissors, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServicosCarousel } from "@/components/agenda/ServicosCarousel";
import { HorizontalScrollStrip } from "@/components/agenda/HorizontalScrollStrip";
import { ResponsivePagedStrip } from "@/components/agenda/ResponsivePagedStrip";
import { buildSlots, duracaoReferenciaBarbeiro, filtrarSlotsLivres } from "@/lib/slots";
import { exitClientBookingFlow } from "@/lib/clientBookingExit";
import { notifyBarberAppointmentChange } from "@/lib/notifyBarberAppointmentChange";
import {
  checkBarbeariaCanBook,
  getClientBookingBlockMessage,
  showClientBookingBlockedToast,
  SUBSCRIPTION_BLOCK_OWNER,
  isSubscriptionBlockError,
} from "../lib/subscription";
import { getBookingStaticCache, setBookingStaticCache } from "../lib/bookingStaticCache";
import { requestClientNotificationPermission, saveClientConfirmationPushSubscription } from "../lib/clientConfirmationPush";

const bookingPageX = "px-3 sm:px-5 md:px-0";
const bookingScrollBleed = "-mx-3 sm:-mx-5 md:mx-0";
const bookingScrollPad = "px-3 sm:px-5 md:px-0";

function dayChipClass(ok: boolean, sel: boolean) {
  return cn(
    "rounded-2xl flex flex-col items-center justify-center font-semibold transition-all cursor-pointer",
    "max-md:snap-start max-md:shrink-0 max-md:w-[68px] max-md:h-20",
    ok ? "bg-available text-available-foreground active:scale-95" : "bg-unavailable text-unavailable-foreground opacity-90",
    sel && ok && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
  );
}

function desktopDayChipClass(ok: boolean, sel: boolean, inRange: boolean) {
  return cn(
    "rounded-xl flex items-center justify-center font-semibold transition-all h-10 w-10 mx-auto",
    !inRange && "bg-muted/50 text-muted-foreground/50 cursor-default",
    inRange && ok && "bg-available text-available-foreground cursor-pointer active:scale-95",
    inRange && !ok && "bg-unavailable text-unavailable-foreground opacity-90 cursor-pointer",
    sel && ok && inRange && "ring-2 ring-foreground ring-offset-1 ring-offset-surface",
  );
}

function barbeiroChipClass(ok: boolean, sel: boolean) {
  return cn(
    "snap-start shrink-0 min-w-[8.5rem] px-4 h-14 rounded-2xl flex items-center justify-center font-semibold transition-all cursor-pointer md:h-12",
    ok ? "bg-available text-available-foreground active:scale-95" : "bg-unavailable text-unavailable-foreground opacity-90",
    sel && ok && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
  );
}

function horarioChipClass(livre: boolean, sel: boolean) {
  return cn(
    "snap-start shrink-0 w-[72px] h-12 rounded-xl flex items-center justify-center font-semibold text-sm transition-all cursor-pointer md:w-[4.5rem] md:h-10",
    livre ? "bg-available text-available-foreground active:scale-95" : "bg-unavailable text-unavailable-foreground opacity-90",
    sel && livre && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
  );
}

function ShopAvatar({ logoUrl, name, className }: { logoUrl: string | null; name: string; className?: string }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={cn("rounded-full object-cover bg-foreground shrink-0", className)}
      />
    );
  }
  return (
    <div className={cn("rounded-full bg-foreground text-background flex items-center justify-center shrink-0", className)}>
      <Scissors className="h-5 w-5" />
    </div>
  );
}

function AvailabilityLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-4 text-xs text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-available" aria-hidden />
        Disponível
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-unavailable" aria-hidden />
        Indisponível
      </span>
    </div>
  );
}

interface Barbearia {
  id: string;
  nome: string;
  logo_url: string | null;
  ativa: boolean;
  telefone: string | null;
}
interface Barbeiro {
  id: string;
  nome: string;
  foto_url: string | null;
  slot_minutos: number;
  disponibilidades: { dia_semana: number; hora_inicio: string; hora_fim: string }[];
  bloqueios: { data: string; hora_inicio: string | null; hora_fim: string | null }[];
  servicos: { id: string; nome: string; duracao_minutos: number }[];
}

type RawBarbeiro = {
  id: string;
  nome: string;
  foto_url: string | null;
  ativo?: boolean;
  slot_minutos: number | null;
  disponibilidades?: { dia_semana: number; hora_inicio: string; hora_fim: string }[];
  bloqueios?: { data: string; hora_inicio: string | null; hora_fim: string | null }[];
  barbeiro_services?: { id: string; nome: string; duracao_minutos: number; ativo?: boolean }[];
};

type AgendamentoOcupado = {
  id: string;
  barbeiro_id: string;
  data: string;
  hora: string;
  duracao_minutos: number | null;
};

const STORAGE_KEY = "agendabarber:cliente";
const DAYS_AHEAD = 14;
const BOOKING_MONTHS = 2;

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_COMPLETOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function parseYmd(value: string) {
  const [y, m, day] = value.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getBookableRange(minDayOffset: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(today.getDate() + minDayOffset);
  const last = new Date(first.getFullYear(), first.getMonth() + BOOKING_MONTHS, 0);
  const days: Date[] = [];
  const cur = new Date(first);
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return { first, last, days };
}

function bookableDayOffset(ownerPanel: boolean, isReschedule: boolean) {
  return ownerPanel || isReschedule ? 0 : 1;
}

function initialBookingDate(ownerPanel: boolean, isReschedule: boolean) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + bookableDayOffset(ownerPanel, isReschedule));
  return ymd(d);
}

function isSameDayOrEarlier(selectedYmd: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selectedYmd <= ymd(today);
}

/** No PC, clique no chip vermelho só centraliza no carrossel (não seleciona). */
const centralizarChipCarrossel = (el: HTMLElement) => {
  el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
};

export type RescheduleContext = {
  agendamentoId: string;
  barbeiroId: string;
  data: string;
  hora: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  observacao: string | null;
  duracao_minutos: number;
  servicos_nomes?: string[];
};

export type PublicBookingProps = {
  slugOverride?: string;
  backHref?: string;
  reschedule?: RescheduleContext | null;
  onRescheduleComplete?: () => void;
  ownerBookingBlockMessage?: string;
  onOwnerBookingBlocked?: (message: string) => void;
  /** Painel do barbeiro (`/app/agendar`) — altera botões da tela de confirmação. */
  ownerPanel?: boolean;
};

const PublicBooking = ({
  slugOverride,
  backHref,
  reschedule = null,
  onRescheduleComplete,
  ownerBookingBlockMessage,
  onOwnerBookingBlocked,
  ownerPanel = false,
}: PublicBookingProps = {}) => {
  const isReschedule = Boolean(reschedule);
  const minDayOffset = bookableDayOffset(ownerPanel, isReschedule);
  const { slug: slugParam } = useParams();
  const slug = slugOverride ?? slugParam;
  const [loading, setLoading] = useState(true);
  const [barbearia, setBarbearia] = useState<Barbearia | null>(null);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  // chave: barbeiroId|YYYY-MM-DD -> Map<hora, duracao>
  const [agOcupados, setAgOcupados] = useState<Map<string, Map<string, number>>>(new Map());

  const [data, setData] = useState(() => initialBookingDate(ownerPanel, isReschedule));
  const [barbeiroId, setBarbeiroId] = useState<string>("");
  const [hora, setHora] = useState<string>("");
  const [servSel, setServSel] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [clientExitHint, setClientExitHint] = useState(false);
  const [slotInterval, setSlotInterval] = useState(30);
  const [slotPause, setSlotPause] = useState(0);
  const [desktopViewMonth, setDesktopViewMonth] = useState(() =>
    monthStart(parseYmd(initialBookingDate(ownerPanel, isReschedule))),
  );

  useEffect(() => {
    if (reschedule) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const c = JSON.parse(saved);
        if (c.nome) setNome(c.nome);
        if (c.whatsapp) setWhatsapp(maskPhone(c.whatsapp));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [reschedule]);

  useEffect(() => {
    if (!reschedule) return;
    setBarbeiroId(reschedule.barbeiroId);
    setData(reschedule.data);
    setHora("");
    setNome(reschedule.cliente_nome);
    setWhatsapp(maskPhone(reschedule.cliente_whatsapp));
    setObservacao(reschedule.observacao ?? "");
    setServSel([]);
  }, [reschedule]);

  useEffect(() => {
    if (!slug) return;

    const load = async () => {
      const { first: start, last: limite } = getBookableRange(minDayOffset);
      const fromYmd = ymd(start);
      const toYmd = ymd(limite);

      const cached = getBookingStaticCache(slug, fromYmd, toYmd);
      if (cached) {
        setBarbearia(cached.barbearia);
        setBarbeiros(cached.barbeiros as Barbeiro[]);
        setSlotInterval(cached.slotInterval);
        setSlotPause(cached.slotPause);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const [{ data: b, error: barbErr }, shopRes] = await Promise.all([
        supabase
          .from("barbearias")
          .select(`
            id, nome, logo_url, ativa,
            barbeiros ( id, nome, foto_url, ativo, slot_minutos,
              disponibilidades ( dia_semana, hora_inicio, hora_fim ),
              bloqueios ( data, hora_inicio, hora_fim ),
              barbeiro_services ( id, nome, duracao_minutos, ativo )
            )
          `)
          .eq("slug", slug)
          .maybeSingle(),
        supabase.from("barbershops").select("whatsapp_number, slot_interval_minutes, slot_pause_minutes").eq("slug", slug).maybeSingle(),
      ]);

      if (barbErr) {
        console.error("[PublicBooking] barbearias:", barbErr.message);
        toast.error("Não foi possível carregar a agenda. Tente novamente.");
        setBarbearia(null);
        setLoading(false);
        return;
      }

      if (!b) { setBarbearia(null); setLoading(false); return; }

      const shopRow = shopRes.data as {
        whatsapp_number?: string | null;
        slot_interval_minutes?: number | null;
        slot_pause_minutes?: number | null;
      } | null;

      const contato = shopRow?.whatsapp_number ?? null;
      setSlotInterval(shopRow?.slot_interval_minutes ?? 30);
      setSlotPause(shopRow?.slot_pause_minutes ?? 0);

      setBarbearia({
        id: b.id,
        nome: b.nome,
        logo_url: b.logo_url,
        ativa: b.ativa,
        telefone: contato,
      });

      const bbs = ((b as { barbeiros?: RawBarbeiro[] }).barbeiros ?? [])
        .filter((bb) => bb.ativo !== false)
        .map((bb) => ({
        id: bb.id,
        nome: bb.nome,
        foto_url: bb.foto_url,
        slot_minutos: bb.slot_minutos ?? 30,
        disponibilidades: bb.disponibilidades ?? [],
        bloqueios: (bb.bloqueios ?? []).filter((bl) => bl.data >= fromYmd && bl.data <= toYmd),
        servicos: (bb.barbeiro_services ?? [])
          .filter((s) => s.ativo)
          .map((s) => ({ id: s.id, nome: s.nome, duracao_minutos: s.duracao_minutos })),
      })) as Barbeiro[];
      setBarbeiros(bbs);

      setBookingStaticCache(slug, {
        barbeariaId: b.id,
        barbearia: {
          id: b.id,
          nome: b.nome,
          logo_url: b.logo_url,
          ativa: b.ativa,
          telefone: contato,
        },
        barbeiros: bbs,
        slotInterval: shopRow?.slot_interval_minutes ?? 30,
        slotPause: shopRow?.slot_pause_minutes ?? 0,
        fromYmd,
        toYmd,
      });

      const bbIds = bbs.map((x) => x.id);
      if (bbIds.length) {
        const { data: ag } = await supabase
          .from("agendamentos")
          .select("id, barbeiro_id, data, hora, duracao_minutos")
          .eq("barbearia_id", b.id)
          .eq("status", "confirmado")
          .gte("data", fromYmd)
          .lte("data", toYmd);
        const map = new Map<string, Map<string, number>>();
        ((ag ?? []) as AgendamentoOcupado[]).forEach((a) => {
          if (reschedule?.agendamentoId && a.id === reschedule.agendamentoId) return;
          const k = `${a.barbeiro_id}|${a.data}`;
          if (!map.has(k)) map.set(k, new Map());
          map.get(k)!.set(String(a.hora).slice(0, 5), a.duracao_minutos ?? 30);
        });
        setAgOcupados(map);
      }
      setLoading(false);
    };
    load();
  }, [slug, reschedule?.agendamentoId, minDayOffset]);

  const bookableRange = useMemo(() => getBookableRange(minDayOffset), [minDayOffset]);

  const dias = useMemo(
    () => bookableRange.days.slice(0, DAYS_AHEAD),
    [bookableRange],
  );

  const allowedMonths = useMemo(() => {
    const first = monthStart(bookableRange.first);
    const second = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    return { first, second };
  }, [bookableRange.first]);

  const desktopCalendarCells = useMemo(() => {
    const year = desktopViewMonth.getFullYear();
    const month = desktopViewMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: firstOfMonth.getDay() }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [desktopViewMonth]);

  const isDayInBookableRange = (d: Date) =>
    d.getTime() >= bookableRange.first.getTime() && d.getTime() <= bookableRange.last.getTime();

  const canGoPrevDesktopMonth = desktopViewMonth.getTime() > allowedMonths.first.getTime();
  const canGoNextDesktopMonth = desktopViewMonth.getTime() < allowedMonths.second.getTime();
  const showDesktopSplit = servSel.length > 0;

  const barbeiroSel = barbeiros.find((b) => b.id === barbeiroId);
  const servicosDoBarbeiro = useMemo(() => barbeiroSel?.servicos ?? [], [barbeiroSel]);

  const duracaoTotal = useMemo(() => {
    if (isReschedule && reschedule) return reschedule.duracao_minutos;
    const soma = servicosDoBarbeiro
      .filter((s) => servSel.includes(s.id))
      .reduce((a, s) => a + s.duracao_minutos, 0);
    if (soma > 0) return soma;
    if (servicosDoBarbeiro.length === 0) return slotInterval;
    return 0;
  }, [servicosDoBarbeiro, servSel, slotInterval, reschedule, isReschedule]);

  type SlotsDiaRaw = {
    all: string[];
    windows: { hora_inicio: string; hora_fim: string }[];
    ocup: Map<string, number>;
    dayBloqs: { hora_inicio: string | null; hora_fim: string | null }[];
  };

  const slotsRaw = useMemo(() => {
    const m = new Map<string, SlotsDiaRaw>();
    for (const bb of barbeiros) {
      for (const d of bookableRange.days) {
        const key = ymd(d);
        const dow = d.getDay();
        const windows = bb.disponibilidades.filter((x) => x.dia_semana === dow);
        m.set(`${bb.id}|${key}`, {
          all: buildSlots(windows, slotInterval, slotPause),
          windows,
          ocup: agOcupados.get(`${bb.id}|${key}`) ?? new Map(),
          dayBloqs: bb.bloqueios.filter((b) => b.data === key),
        });
      }
    }
    return m;
  }, [barbeiros, bookableRange.days, agOcupados, slotInterval, slotPause]);

  const livresComDuracao = (bbId: string, dayKey: string, dur: number) => {
    if (dur <= 0) return [];
    const raw = slotsRaw.get(`${bbId}|${dayKey}`);
    if (!raw) return [];
    return filtrarSlotsLivres(raw.all, raw.windows, raw.ocup, raw.dayBloqs, dur, slotPause);
  };

  /** Para cor do nome: precisa caber o maior serviço do barbeiro (não só barba/encaixe curto). */
  const duracaoExigidaNoCarrossel = (bb: Barbeiro) => {
    if (isReschedule && reschedule && bb.id === barbeiroId) return reschedule.duracao_minutos;
    return duracaoReferenciaBarbeiro(bb.servicos, slotInterval);
  };

  const diaTemDisp = (k: string) =>
    barbeiros.some((b) => livresComDuracao(b.id, k, duracaoExigidaNoCarrossel(b)).length > 0);

  const barbeiroTemDispNoDia = (bbId: string) => {
    const bb = barbeiros.find((b) => b.id === bbId);
    if (!bb) return false;
    return livresComDuracao(bbId, data, duracaoExigidaNoCarrossel(bb)).length > 0;
  };

  const barbeiroMotivoIndisponivel = (bb: Barbeiro) => {
    if (bb.disponibilidades.length === 0) {
      return "Configure horários em Configurações → Equipe e atendimento";
    }
    const dow = new Date(`${data}T12:00:00`).getDay();
    const temHorarioNoDia = bb.disponibilidades.some((x) => x.dia_semana === dow);
    if (!temHorarioNoDia) return "Sem horário de atendimento neste dia";
    return "Sem horários livres neste dia";
  };

  const slotsDoBarbeiroNoDia = useMemo(() => {
    if (!barbeiroId) return { all: [] as string[], livres: [] as string[] };
    const raw = slotsRaw.get(`${barbeiroId}|${data}`);
    if (!raw) return { all: [], livres: [] };
    const livres = duracaoTotal > 0 ? filtrarSlotsLivres(raw.all, raw.windows, raw.ocup, raw.dayBloqs, duracaoTotal, slotPause) : [];
    return { all: raw.all, livres };
  }, [barbeiroId, data, slotsRaw, duracaoTotal, slotPause]);

  useEffect(() => {
    if (hora && !slotsDoBarbeiroNoDia.livres.includes(hora)) setHora("");
  }, [hora, slotsDoBarbeiroNoDia.livres]);

  useEffect(() => {
    setDesktopViewMonth(monthStart(parseYmd(data)));
  }, [data]);

  const toggleServico = (id: string) => {
    setServSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setHora("");
  };

  const horarioAindaDisponivel = () =>
    Boolean(hora && slotsDoBarbeiroNoDia.livres.includes(hora));

  const rejectSameDayPublicBooking = () => {
    if (minDayOffset > 0 && isSameDayOrEarlier(data)) {
      toast.error("Pelo link de agendamento, só é possível marcar a partir de amanhã.");
      return true;
    }
    return false;
  };

  const ownerBlockMessage = () =>
    ownerBookingBlockMessage?.trim() || SUBSCRIPTION_BLOCK_OWNER;

  const clientBlockMessage = () => getClientBookingBlockMessage(barbearia?.nome);

  const notifyBookingBlocked = () => {
    if (slugOverride) {
      const message = ownerBlockMessage();
      if (onOwnerBookingBlocked) {
        onOwnerBookingBlocked(message);
        return;
      }
      toast.error(message, { position: "top-center" });
      return;
    }
    showClientBookingBlockedToast(clientBlockMessage());
  };

  async function executeClientReschedule(): Promise<boolean> {
    if (!reschedule || !barbearia || !slug || !barbeiroId || !data || !hora) return false;

    const selectedDate = data;
    const obs = observacao.trim() || null;
    const servicosNomes =
      servSel.length > 0
        ? servicosDoBarbeiro.filter((s) => servSel.includes(s.id)).map((s) => s.nome)
        : (reschedule.servicos_nomes ?? []);

    setSubmitting(true);
    try {
      const { data: rpcData, error } = await supabase.rpc("reagendar_agendamento_cliente", {
        p_agendamento_id: reschedule.agendamentoId,
        p_slug: slug,
        p_whatsapp: unmaskPhone(whatsapp),
        p_data: selectedDate,
        p_hora: hora,
        p_barbeiro_id: barbeiroId,
        p_duracao_minutos: duracaoTotal,
        p_observacao: obs,
        p_servicos_nomes: servicosNomes,
      });

      if (error) {
        if (error.code === "23505") toast.error("Esse horário acabou de ser preenchido. Escolha outro.");
        else toast.error(error.message);
        return false;
      }

      const result = rpcData as { old_data?: string; new_data?: string } | null;
      await notifyBarberAppointmentChange({
        agendamento_id: reschedule.agendamentoId,
        event: "rescheduled",
        old_data: result?.old_data ?? reschedule.data,
        new_data: result?.new_data ?? selectedDate,
      });
      return true;
    } finally {
      setSubmitting(false);
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barbearia || !barbeiroId || !data || !hora) return toast.error("Selecione dia, barbeiro e horário");
    if (!isReschedule && servicosDoBarbeiro.length > 0 && servSel.length === 0) {
      return toast.error("Selecione pelo menos um serviço");
    }
    if (!horarioAindaDisponivel()) {
      return toast.error("Esse horário não está mais disponível para os serviços selecionados. Escolha outro.");
    }
    if (!nome.trim()) return toast.error("Informe seu nome");
    if (!isValidPhone(whatsapp)) return toast.error("WhatsApp inválido");
    if (rejectSameDayPublicBooking()) return;

    if (!ownerPanel || !reschedule) {
      setBookingConfirmed(false);
      setDone(true);
      return;
    }

    const canBook = await checkBarbeariaCanBook(barbearia.id);
    if (!canBook) {
      notifyBookingBlocked();
      return;
    }

    setSubmitting(true);
    const obs = observacao.trim() || null;
    const servicosNomes =
      servSel.length > 0
        ? servicosDoBarbeiro.filter((s) => servSel.includes(s.id)).map((s) => s.nome)
        : (reschedule.servicos_nomes ?? []);

    try {
      const { error } = await supabase.rpc("reagendar_agendamento", {
        p_agendamento_id: reschedule.agendamentoId,
        p_data: data,
        p_hora: hora,
        p_barbeiro_id: barbeiroId,
        p_duracao_minutos: duracaoTotal,
        p_observacao: obs,
        p_servicos_nomes: servicosNomes,
      });

      if (error) {
        if (error.code === "23505") toast.error("Esse horário acabou de ser preenchido. Escolha outro.");
        else if (isSubscriptionBlockError(error.message)) {
          notifyBookingBlocked();
        } else toast.error(error.message);
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmBooking = async () => {
    if (!barbearia || !barbeiroId || !data || !hora) return;
    if (rejectSameDayPublicBooking()) return;
    if (!isReschedule && servicosDoBarbeiro.length > 0 && servSel.length === 0) {
      toast.error("Selecione pelo menos um serviço");
      return;
    }
    if (!horarioAindaDisponivel()) {
      toast.error("Esse horário não está mais disponível para os serviços selecionados. Escolha outro.");
      return;
    }
    if (!nome.trim()) return toast.error("Informe seu nome");
    if (!isValidPhone(whatsapp)) return toast.error("WhatsApp inválido");

    if (!ownerPanel && !isReschedule) {
      await requestClientNotificationPermission();
    }

    const canBook = await checkBarbeariaCanBook(barbearia.id);
    if (!canBook) {
      notifyBookingBlocked();
      return;
    }

    if (isReschedule && reschedule) {
      const ok = await executeClientReschedule();
      if (ok) {
        toast.success("Horário alterado!");
        setBookingConfirmed(true);
      }
      return;
    }

    setSubmitting(true);
    const whatsClean = unmaskPhone(whatsapp);
    const obs = observacao.trim() || null;
    const servicosNomes =
      servSel.length > 0
        ? servicosDoBarbeiro.filter((s) => servSel.includes(s.id)).map((s) => s.nome)
        : [];

    try {
      const { data: cliId } = await supabase.rpc("upsert_cliente_por_whatsapp", {
        _barbearia_id: barbearia.id,
        _whatsapp: whatsClean,
        _nome: nome.trim(),
      });
      const { data: createdAppointment, error } = await supabase
        .from("agendamentos")
        .insert({
          barbearia_id: barbearia.id,
          barbeiro_id: barbeiroId,
          data,
          hora,
          cliente_nome: nome.trim(),
          cliente_whatsapp: whatsClean,
          cliente_id: cliId ?? null,
          duracao_minutos: duracaoTotal,
          servicos_nomes: servicosNomes,
          status: "confirmado",
          observacao: obs,
          origem: ownerPanel ? "painel" : "link_publico",
          requires_client_confirmation: !ownerPanel,
        })
        .select("id, confirmation_token")
        .single();

      if (error) {
        if (error.code === "23505") toast.error("Esse horário acabou de ser preenchido. Escolha outro.");
        else if (isSubscriptionBlockError(error.message)) {
          notifyBookingBlocked();
        } else toast.error(error.message);
        return;
      }

      if (!ownerPanel && createdAppointment?.id) {
        void supabase.functions
          .invoke("notify-barber-new-booking", { body: { agendamento_id: createdAppointment.id } })
          .catch(() => undefined);
      }

      if (!ownerPanel && createdAppointment?.confirmation_token) {
        void saveClientConfirmationPushSubscription({
          confirmationToken: createdAppointment.confirmation_token,
        }).catch(() => undefined);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nome: nome.trim(), whatsapp: whatsClean }));
      setBookingConfirmed(true);
    } finally {
      setSubmitting(false);
    }
  };

  const alterBooking = () => {
    setBookingConfirmed(false);
    setDone(false);
  };

  const showClientExit = !ownerPanel && !isReschedule;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!barbearia) return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 text-center bg-surface">
      <div>
        <h1 className="font-display text-2xl font-bold">Barbearia não encontrada</h1>
        <p className="mt-2 text-muted-foreground text-sm">Verifique o link e tente novamente.</p>
      </div>
    </div>
  );

  if (!barbearia.ativa) return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 text-center bg-surface">
      <div className="max-w-sm">
        <h1 className="font-display text-2xl font-bold">Agenda indisponível</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Entre em contato diretamente com a barbearia.
        </p>
      </div>
    </div>
  );

  if (done) {
    const barbeiroNome = barbeiros.find((b) => b.id === barbeiroId)?.nome ?? "";

    if (isReschedule && bookingConfirmed) {
      return (
        <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 bg-surface">
          <Card className="max-w-sm w-full p-6 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-available/10 flex items-center justify-center">
              <Check className="h-6 w-6 text-available" />
            </div>
            <h1 className="mt-4 font-display text-xl font-bold">Horário alterado!</h1>
            <p className="mt-2 text-muted-foreground text-sm">
              Novo horário: <b className="text-foreground">{new Date(data + "T00:00:00").toLocaleDateString("pt-BR")}</b> às{" "}
              <b className="text-foreground">{hora}</b>.
            </p>
            <Button className="mt-6 w-full" onClick={() => onRescheduleComplete?.()}>
              Voltar aos agendamentos
            </Button>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-3 sm:p-6 bg-surface">
        <Card className="relative max-w-sm w-full p-6">
          {bookingConfirmed && showClientExit && !clientExitHint && (
            <button
              type="button"
              onClick={() => {
                if (!exitClientBookingFlow()) setClientExitHint(true);
              }}
              className="absolute top-3 right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-foreground bg-white text-foreground shadow-md hover:bg-muted/80 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-7 w-7" strokeWidth={3} />
            </button>
          )}

          {clientExitHint ? (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gradient-brand shadow-glow">
                <Check className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <p className="mt-4 font-display text-xl font-bold text-gradient">Tudo certo!</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Seu agendamento foi confirmado. Pode fechar esta aba ou voltar ao app de onde veio.
              </p>
            </div>
          ) : (
            <>
          {bookingConfirmed && (
            <div className="mb-5 rounded-2xl border border-border bg-white px-4 py-4 text-center shadow-sm">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gradient-brand shadow-glow">
                <Check className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <p className="mt-3 font-display text-xl font-bold text-gradient">Agendamento confirmado!</p>
            </div>
          )}

          {!bookingConfirmed && (
            <>
              <h1 className="font-display text-xl font-bold text-center">Confirme seu agendamento</h1>
              <p className="mt-2 text-muted-foreground text-sm text-center">
                Revise os dados antes de salvar. Você pode alterar se algo estiver errado.
              </p>
            </>
          )}

          <ul className={cn("space-y-2 text-sm border-t border-border pt-4", !bookingConfirmed && "mt-4")}>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Data</span>
              <span className="font-medium">{new Date(data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Horário</span>
              <span className="font-medium">{hora}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Profissional</span>
              <span className="font-medium text-right">{barbeiroNome}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">Nome</span>
              <span className="font-medium text-right">{nome}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted-foreground">WhatsApp</span>
              <span className="font-medium">{maskPhone(unmaskPhone(whatsapp))}</span>
            </li>
            {observacao.trim() && (
              <li className="pt-1 border-t border-border/60">
                <span className="text-muted-foreground block mb-1">Observação</span>
                <span className="font-medium">{observacao}</span>
              </li>
            )}
          </ul>
          {!bookingConfirmed && (
            <div className="mt-6 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-full" disabled={submitting} onClick={alterBooking}>
                Alterar
              </Button>
              <Button type="button" className="flex-1 rounded-full" disabled={submitting} onClick={confirmBooking}>
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isReschedule ? (
                  "Confirmar novo horário"
                ) : (
                  "Confirmar"
                )}
              </Button>
            </div>
          )}

          {bookingConfirmed && ownerPanel && (
            <Button asChild className="mt-6 w-full rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow">
              <Link to="/app/agendamentos">Sair</Link>
            </Button>
          )}
            </>
          )}
        </Card>
      </div>
    );
  }

  const semHorariosNoDia = barbeiroId && duracaoTotal > 0 && slotsDoBarbeiroNoDia.all.length === 0;
  const precisaEscolherServico =
    !isReschedule && Boolean(barbeiroId) && servicosDoBarbeiro.length > 0 && servSel.length === 0;
  const semBlocoParaServicos =
    Boolean(barbeiroId) && duracaoTotal > 0 && slotsDoBarbeiroNoDia.all.length > 0 && slotsDoBarbeiroNoDia.livres.length === 0;
  const barbeiroSemDispNoDia = Boolean(barbeiroId && barbeiroSel && !barbeiroTemDispNoDia(barbeiroId));
  const waLink = whatsappHref(barbearia.telefone);

  const onDayClick = (d: Date, ok: boolean, el: HTMLElement) => {
    if (ok) {
      setData(ymd(d));
      setBarbeiroId("");
      setHora("");
      setServSel([]);
    } else {
      centralizarChipCarrossel(el);
    }
  };

  const renderDayButton = (d: Date) => {
    const key = ymd(d);
    const ok = diaTemDisp(key);
    const sel = key === data;
    return (
      <button
        key={key}
        data-day={key}
        type="button"
        aria-disabled={!ok}
        title={ok ? undefined : "Sem disponibilidade neste dia"}
        onClick={(e) => onDayClick(d, ok, e.currentTarget)}
        className={dayChipClass(ok, sel)}
        aria-pressed={sel && ok}
      >
        <span className="text-[11px] opacity-90 font-medium">{DIAS[d.getDay()]}</span>
        <span className="font-display text-xl leading-none my-0.5">{d.getDate()}</span>
        <span className="text-[10px] opacity-80">{MESES[d.getMonth()]}</span>
      </button>
    );
  };

  const renderDesktopDayButton = (d: Date) => {
    const key = ymd(d);
    const inRange = isDayInBookableRange(d);
    const ok = inRange && diaTemDisp(key);
    const sel = key === data;
    return (
      <button
        key={key}
        data-day={key}
        type="button"
        disabled={!inRange}
        aria-disabled={!inRange || !ok}
        title={
          !inRange
            ? "Data fora do período disponível"
            : ok
              ? undefined
              : "Sem disponibilidade neste dia"
        }
        onClick={(e) => {
          if (!inRange) return;
          onDayClick(d, ok, e.currentTarget);
        }}
        className={desktopDayChipClass(ok, sel, inRange)}
        aria-pressed={sel && ok}
      >
        <span className="font-display text-base leading-none">{d.getDate()}</span>
      </button>
    );
  };

  const renderBarbeiroButton = (b: Barbeiro) => {
    const ok = barbeiroTemDispNoDia(b.id);
    const sel = b.id === barbeiroId;
    return (
      <button
        key={b.id}
        data-barbeiro={b.id}
        type="button"
        aria-disabled={!ok}
        title={ok ? undefined : barbeiroMotivoIndisponivel(b)}
        onClick={(e) => {
          if (ok) {
            setBarbeiroId(b.id);
            setHora("");
            setServSel([]);
          } else {
            centralizarChipCarrossel(e.currentTarget);
          }
        }}
        className={barbeiroChipClass(ok, sel)}
        aria-pressed={sel && ok}
      >
        {b.nome}
      </button>
    );
  };

  const renderHorarioButton = (s: string) => {
    const livre = slotsDoBarbeiroNoDia.livres.includes(s);
    const sel = s === hora;
    return (
      <button
        key={s}
        data-slot={s}
        type="button"
        aria-disabled={!livre}
        title={livre ? undefined : "Horário indisponível"}
        onClick={(e) => {
          if (livre) setHora(s);
          else centralizarChipCarrossel(e.currentTarget);
        }}
        className={horarioChipClass(livre, sel)}
        aria-pressed={sel && livre}
      >
        {s}
      </button>
    );
  };

  const horariosContent =
    !barbeiroId ? (
      <p className="text-sm text-muted-foreground">Escolha um barbeiro acima para ver os horários.</p>
    ) : barbeiroSemDispNoDia ? null : precisaEscolherServico ? (
      <Card className="p-3.5 bg-muted/40 border-border text-sm text-foreground md:p-3">
        Selecione um ou mais serviços acima. Os horários aparecem conforme o tempo total dos serviços.
      </Card>
    ) : semHorariosNoDia ? (
      <Card className="p-3.5 bg-unavailable-soft border-unavailable/20 text-sm text-foreground md:p-3">
        Sem horários para essa data com <b>{barbeiroSel?.nome}</b>. Escolha outra data ou outro barbeiro.
      </Card>
    ) : semBlocoParaServicos ? (
      <Card className="p-3.5 bg-unavailable-soft border-unavailable/30 text-sm text-foreground space-y-2 md:p-3">
        <p>
          <b>Não há disponibilidade</b> para os serviços selecionados ({duracaoTotal} min) nesta data com{" "}
          <b>{barbeiroSel?.nome}</b>.
        </p>
        <p className="text-muted-foreground">
          Escolha outra data ou outro barbeiro
          {waLink ? (
            <>
              , ou{" "}
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground font-semibold underline underline-offset-2"
              >
                fale conosco no WhatsApp
              </a>{" "}
              para ver se conseguimos encaixá-lo.
            </>
          ) : (
            "."
          )}
        </p>
      </Card>
    ) : (
      <>
        <div className={cn("md:hidden", bookingScrollBleed)}>
          <HorizontalScrollStrip centerOn={hora ? `[data-slot="${hora}"]` : null} className={bookingScrollPad}>
            {slotsDoBarbeiroNoDia.all.map(renderHorarioButton)}
          </HorizontalScrollStrip>
        </div>
        <div className="hidden md:flex md:flex-wrap md:gap-1.5 md:py-0.5">
          {slotsDoBarbeiroNoDia.all.map(renderHorarioButton)}
        </div>
      </>
    );

  return (
    <div className="min-h-screen bg-surface w-full max-w-[100vw] overflow-x-hidden md:min-h-0">
      <div className="mx-auto w-full sm:max-w-md md:max-w-6xl md:px-6 overflow-x-hidden">
        {/* HEADER */}
        <header
          className={cn(
            "bg-card border-b border-border pt-6 pb-4 md:pt-4 md:pb-3",
            bookingPageX,
            ownerPanel && "max-md:hidden",
          )}
        >
          {backHref && !ownerPanel && (
            <Link
              to={backHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4 md:mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          )}
          <div
            className={cn(
              "md:grid md:grid-cols-2 md:gap-x-8 md:items-center",
              showDesktopSplit && "md:gap-x-0",
            )}
          >
            <div className={cn("min-w-0", showDesktopSplit && "md:pr-8")}>
              {!ownerPanel && (
                <div className="hidden md:flex items-center justify-between gap-4 min-w-0 md:pl-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <ShopAvatar logoUrl={barbearia.logo_url} name={barbearia.nome} className="h-[3.25rem] w-[3.25rem]" />
                    <h1 className="font-display text-[1.65rem] font-bold leading-tight truncate text-foreground">{barbearia.nome}</h1>
                  </div>
                  <AvailabilityLegend className="shrink-0 gap-5" />
                </div>
              )}
              {ownerPanel && (
                <div className="hidden md:flex items-center justify-center w-full">
                  <AvailabilityLegend className="py-1" />
                </div>
              )}
            </div>
            <div className="hidden md:block" aria-hidden="true" />
          </div>
        </header>

        <form onSubmit={submit} className={cn("py-5 max-md:space-y-6 md:py-4", bookingPageX)}>
          <div className="flex flex-col items-center gap-1.5 min-w-0 md:hidden w-full">
            <div className="flex items-center gap-2.5 min-w-0 w-full">
              <ShopAvatar logoUrl={barbearia.logo_url} name={barbearia.nome} className="h-12 w-12" />
              <h1 className="font-display text-2xl font-bold leading-tight truncate min-w-0">{barbearia.nome}</h1>
            </div>
            <AvailabilityLegend className="mt-0.5" />
          </div>

          {isReschedule && (
            <Card className="p-3.5 bg-primary/10 border-primary/25 text-sm md:p-3 md:mb-3">
              <p className="font-semibold text-foreground">Alterar horário</p>
              <p className="text-muted-foreground mt-1">
                Cliente: <span className="text-foreground font-medium">{nome}</span>
                {reschedule?.hora && (
                  <>
                    {" "}
                    · Antes: {new Date(reschedule.data + "T00:00:00").toLocaleDateString("pt-BR")} às {reschedule.hora}
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Escolha um novo dia e horário disponível abaixo.</p>
            </Card>
          )}

          <div
            className={cn(
              "max-md:space-y-6 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-3 md:items-start",
              showDesktopSplit && "md:gap-x-0",
            )}
          >
            <div className={cn("max-md:space-y-6 md:space-y-3", showDesktopSplit && "md:pr-8")}>
              {/* DIAS */}
              <section>
                <h2 className="font-display text-base font-semibold mb-2.5 md:hidden">Selecione o dia</h2>
                <div className={cn("md:hidden", bookingScrollBleed)}>
                  <HorizontalScrollStrip centerOn={`[data-day="${data}"]`} className={bookingScrollPad}>
                    {dias.map(renderDayButton)}
                  </HorizontalScrollStrip>
                </div>
                <div className="hidden md:block">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="w-28">
                      {canGoPrevDesktopMonth ? (
                        <button
                          type="button"
                          onClick={() => setDesktopViewMonth(allowedMonths.first)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          {MESES_COMPLETOS[allowedMonths.first.getMonth()]}
                        </button>
                      ) : null}
                    </div>
                    <p className="font-display text-sm font-semibold text-center">
                      {MESES_COMPLETOS[desktopViewMonth.getMonth()]} {desktopViewMonth.getFullYear()}
                    </p>
                    <div className="w-28 text-right">
                      {canGoNextDesktopMonth ? (
                        <button
                          type="button"
                          onClick={() => setDesktopViewMonth(allowedMonths.second)}
                          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground ml-auto"
                        >
                          {MESES_COMPLETOS[allowedMonths.second.getMonth()]}
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {DIAS.map((label) => (
                      <span key={label} className="text-[10px] text-center text-muted-foreground font-medium">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 py-0.5">
                    {desktopCalendarCells.map((d, index) =>
                      d ? renderDesktopDayButton(d) : <div key={`empty-${index}`} className="h-10" aria-hidden />,
                    )}
                  </div>
                </div>
              </section>

              {/* BARBEIROS */}
              <section>
                <h2 className="font-display text-base md:text-sm font-semibold mb-2.5 md:mb-1.5">Selecione o barbeiro</h2>
                {barbeiros.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Não foi cadastrado nenhum colaborador.</p>
                ) : (
                  <ResponsivePagedStrip
                    bleedClassName={bookingScrollBleed}
                    mobileClassName={bookingScrollPad}
                    centerOn={barbeiroId ? `[data-barbeiro="${barbeiroId}"]` : null}
                  >
                    {barbeiros.map(renderBarbeiroButton)}
                  </ResponsivePagedStrip>
                )}
                {barbeiroSemDispNoDia && (
                  <Card className="mt-3 p-3.5 bg-unavailable-soft border-unavailable/30 text-sm text-foreground space-y-1.5 md:mt-2 md:p-3">
                    <p>
                      <b className="text-unavailable">Sem disponibilidade</b> com <b>{barbeiroSel?.nome}</b> neste dia.
                    </p>
                    <p className="text-muted-foreground">
                      Escolha outro dia ou outro barbeiro
                      {waLink ? (
                        <>
                          , ou{" "}
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground font-semibold underline underline-offset-2"
                          >
                            entre em contato conosco
                          </a>{" "}
                          para ver se conseguimos um encaixe.
                        </>
                      ) : (
                        "."
                      )}
                    </p>
                  </Card>
                )}
              </section>

              {/* SERVIÇOS */}
              {barbeiroId && servicosDoBarbeiro.length > 0 && !barbeiroSemDispNoDia && (
                <section>
                  <h2 className="font-display text-base md:text-sm font-semibold mb-2.5 md:mb-1.5">Serviços</h2>
                  <ServicosCarousel
                    servicos={servicosDoBarbeiro}
                    selecionados={servSel}
                    onToggle={toggleServico}
                    stripClassName={bookingScrollPad}
                    bleedClassName={bookingScrollBleed}
                  />
                </section>
              )}
            </div>

            <div
              className={cn(
                "max-md:space-y-6 md:space-y-3",
                showDesktopSplit && "md:pl-8 booking-split-divider",
              )}
            >
              {/* HORÁRIOS */}
              <section>
                <h2 className="font-display text-base md:text-sm font-semibold mb-2.5 md:mb-1.5">Selecione o horário</h2>
                {horariosContent}
              </section>

              {/* DADOS */}
              <section className="space-y-3 md:space-y-2">
                <div className="md:grid md:grid-cols-2 md:gap-3 md:space-y-0 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 md:mb-1 md:text-xs">
                      {isReschedule ? "Cliente" : "Seu nome"}
                    </label>
                    <Input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Como devemos te chamar"
                      required
                      maxLength={80}
                      readOnly={isReschedule}
                      className={cn("h-12 md:h-10 text-base md:text-sm", isReschedule && "bg-muted/50")}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 md:mb-1 md:text-xs">WhatsApp</label>
                    <Input
                      inputMode="tel"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                      placeholder="(11) 91234-5678"
                      required
                      readOnly={isReschedule}
                      className={cn("h-12 md:h-10 text-base md:text-sm", isReschedule && "bg-muted/50")}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5 md:mb-1 md:text-xs">
                    Observação <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Ex.: preferência de corte, alergia, pedido especial..."
                    maxLength={500}
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none md:min-h-[4.25rem] md:max-h-[4.25rem]"
                  />
                </div>

              </section>

              <Button
                type="submit"
                disabled={submitting || !barbeiroId || !hora}
                className="w-full h-13 md:h-11 text-base md:text-sm font-semibold py-3.5 md:py-2.5 rounded-xl"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isReschedule ? (
                  "Confirmar novo horário"
                ) : (
                  "Confirmar agendamento"
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PublicBooking;
