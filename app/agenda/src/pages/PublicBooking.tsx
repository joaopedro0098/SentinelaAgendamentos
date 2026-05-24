import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { maskPhone, unmaskPhone, isValidPhone, whatsappHref } from "@/lib/phone";
import { ArrowLeft, Bell, Check, Loader2, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServicosCarousel } from "@/components/agenda/ServicosCarousel";
import { HorizontalScrollStrip } from "@/components/agenda/HorizontalScrollStrip";
import { buildSlots, duracaoReferenciaBarbeiro, filtrarSlotsLivres } from "@/lib/slots";
import { isIosDevice, isStandalonePwa, registerAppointmentPush, supportsWebPush } from "@/lib/pushNotifications";
import {
  checkBarbeariaCanBook,
  getSubscriptionBlockClient,
  SUBSCRIPTION_BLOCK_OWNER,
  isSubscriptionBlockError,
} from "../lib/subscription";

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

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
};

export type PublicBookingProps = {
  slugOverride?: string;
  backHref?: string;
  hideMeusAgendamentos?: boolean;
  reschedule?: RescheduleContext | null;
  onRescheduleComplete?: () => void;
};

const PublicBooking = ({
  slugOverride,
  backHref,
  hideMeusAgendamentos = false,
  reschedule = null,
  onRescheduleComplete,
}: PublicBookingProps = {}) => {
  const isReschedule = Boolean(reschedule);
  const { slug: slugParam } = useParams();
  const slug = slugOverride ?? slugParam;
  const [loading, setLoading] = useState(true);
  const [barbearia, setBarbearia] = useState<Barbearia | null>(null);
  const [barbeiros, setBarbeiros] = useState<Barbeiro[]>([]);
  // chave: barbeiroId|YYYY-MM-DD -> Map<hora, duracao>
  const [agOcupados, setAgOcupados] = useState<Map<string, Map<string, number>>>(new Map());

  const [data, setData] = useState<string>(ymd(new Date()));
  const [barbeiroId, setBarbeiroId] = useState<string>("");
  const [hora, setHora] = useState<string>("");
  const [servSel, setServSel] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [observacao, setObservacao] = useState("");
  const [wantsReminder, setWantsReminder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [slotInterval, setSlotInterval] = useState(30);
  const [slotPause, setSlotPause] = useState(0);

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
      setLoading(true);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const limite = new Date(today); limite.setDate(today.getDate() + DAYS_AHEAD);
      const fromYmd = ymd(today);
      const toYmd = ymd(limite);

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
  }, [slug, reschedule?.agendamentoId]);

  const dias = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() + i); return d;
    });
  }, []);

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
      for (const d of dias) {
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
  }, [barbeiros, dias, agOcupados, slotInterval, slotPause]);

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

  const toggleServico = (id: string) => {
    setServSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setHora("");
  };

  const horarioAindaDisponivel = () =>
    Boolean(hora && slotsDoBarbeiroNoDia.livres.includes(hora));

  const subscriptionBlockMessage = () =>
    slugOverride ? SUBSCRIPTION_BLOCK_OWNER : getSubscriptionBlockClient(barbearia?.nome);

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

    if (!reschedule) {
      setDone(true);
      return;
    }

    const canBook = await checkBarbeariaCanBook(barbearia.id);
    if (!canBook) {
      toast.error(subscriptionBlockMessage());
      return;
    }

    setSubmitting(true);
    const obs = observacao.trim() || null;
    const { error } = await supabase.rpc("reagendar_agendamento", {
      p_agendamento_id: reschedule.agendamentoId,
      p_data: data,
      p_hora: hora,
      p_barbeiro_id: barbeiroId,
      p_duracao_minutos: duracaoTotal,
      p_observacao: obs,
    });
    setSubmitting(false);
    if (error) {
      if (error.code === "23505") toast.error("Esse horário acabou de ser preenchido. Escolha outro.");
      else if (isSubscriptionBlockError(error.message)) {
        toast.error(subscriptionBlockMessage());
      } else toast.error(error.message);
      return;
    }
    setDone(true);
  };

  const confirmBooking = async () => {
    if (!barbearia || !barbeiroId || !data || !hora) return;
    if (servicosDoBarbeiro.length > 0 && servSel.length === 0) {
      toast.error("Selecione pelo menos um serviço");
      return;
    }
    if (!horarioAindaDisponivel()) {
      toast.error("Esse horário não está mais disponível para os serviços selecionados. Escolha outro.");
      return;
    }

    const canBook = await checkBarbeariaCanBook(barbearia.id);
    if (!canBook) {
      toast.error(subscriptionBlockMessage());
      return;
    }

    setSubmitting(true);
    const whatsClean = unmaskPhone(whatsapp);
    const obs = observacao.trim() || null;

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
        status: "confirmado",
        observacao: obs,
        requires_client_confirmation: wantsReminder,
      })
      .select("id")
      .single();

    if (error) {
      setSubmitting(false);
      if (error.code === "23505") toast.error("Esse horário acabou de ser preenchido. Escolha outro.");
      else if (isSubscriptionBlockError(error.message)) {
        toast.error(subscriptionBlockMessage());
      } else toast.error(error.message);
      return;
    }

    if (wantsReminder && createdAppointment?.id) {
      const pushResult = await registerAppointmentPush(createdAppointment.id).catch((err) => ({
        ok: false,
        message: err instanceof Error ? err.message : "falha inesperada",
      }));
      if (pushResult.ok) {
        toast.success("Agendamento confirmado e lembrete ativado!");
      } else {
        toast.warning(`Agendamento confirmado, mas o lembrete não foi ativado: ${pushResult.message}`);
      }
    } else {
      toast.success("Agendamento confirmado!");
    }

    setSubmitting(false);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nome: nome.trim(), whatsapp: whatsClean }));
    setDone(false);
    setHora("");
    setServSel([]);
    setObservacao("");
    setWantsReminder(false);
  };

  const alterBooking = () => {
    setDone(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!barbearia) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center bg-surface">
      <div>
        <h1 className="font-display text-2xl font-bold">Barbearia não encontrada</h1>
        <p className="mt-2 text-muted-foreground text-sm">Verifique o link e tente novamente.</p>
      </div>
    </div>
  );

  if (!barbearia.ativa) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center bg-surface">
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

    if (isReschedule) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
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
      <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
        <Card className="max-w-sm w-full p-6">
          <h1 className="font-display text-xl font-bold text-center">Confirme seu agendamento</h1>
          <p className="mt-2 text-muted-foreground text-sm text-center">
            Revise os dados antes de salvar. Você pode alterar se algo estiver errado.
          </p>
          <ul className="mt-4 space-y-2 text-sm border-t border-border pt-4">
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
          <div className="mt-6 flex gap-2">
            <Button type="button" variant="outline" className="flex-1 rounded-full" disabled={submitting} onClick={alterBooking}>
              Alterar
            </Button>
            <Button type="button" className="flex-1 rounded-full" disabled={submitting} onClick={confirmBooking}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirmar"}
            </Button>
          </div>
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
  const isIos = typeof window !== "undefined" && isIosDevice();
  const iosNeedsInstall = isIos && !isStandalonePwa();
  const pushAvailable = typeof window !== "undefined" && supportsWebPush();

  return (
    <div className="min-h-screen bg-surface w-full max-w-[100vw] overflow-x-hidden">
      <div className="mx-auto w-full max-w-md overflow-x-hidden">
        {/* HEADER */}
        <header className="bg-card border-b border-border px-5 pt-6 pb-4">
          {backHref && (
            <Link
              to={backHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          )}
          <div className="flex items-center gap-3">
            {barbearia.logo_url ? (
              <img src={barbearia.logo_url} alt={barbearia.nome} className="h-12 w-12 rounded-full object-cover bg-foreground shrink-0" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
                <Scissors className="h-5 w-5" />
              </div>
            )}
            <h1 className="font-display text-2xl font-bold leading-tight flex-1 truncate">{barbearia.nome}</h1>
          </div>
          <div className="mt-3 flex items-center justify-center gap-5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-available" /> Disponível</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-unavailable" /> Indisponível</span>
          </div>
          {!hideMeusAgendamentos && slug && (
            <div className="mt-3 flex justify-center">
              <Link
                to={`/agendar/${slug}/meus`}
                className="text-xs font-semibold underline-offset-4 hover:underline text-foreground"
              >
                Meus agendamentos
              </Link>
            </div>
          )}
        </header>

        <form onSubmit={submit} className="px-5 py-5 space-y-6">
          {isReschedule && (
            <Card className="p-3.5 bg-primary/10 border-primary/25 text-sm">
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

          {/* DIAS */}
          <section>
            <h2 className="font-display text-base font-semibold mb-2.5">Selecione o dia</h2>
            <HorizontalScrollStrip centerOn={`[data-day="${data}"]`}>
              {dias.map((d) => {
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
                    onClick={(e) => {
                      if (ok) {
                        setData(key);
                        setBarbeiroId("");
                        setHora("");
                        setServSel([]);
                      } else {
                        centralizarChipCarrossel(e.currentTarget);
                      }
                    }}
                    className={cn(
                      "snap-start shrink-0 w-[68px] h-20 rounded-2xl flex flex-col items-center justify-center font-semibold transition-all cursor-pointer",
                      ok ? "bg-available text-available-foreground active:scale-95" : "bg-unavailable text-unavailable-foreground opacity-90",
                      sel && ok && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                    )}
                    aria-pressed={sel && ok}
                  >
                    <span className="text-[11px] opacity-90 font-medium">{DIAS[d.getDay()]}</span>
                    <span className="font-display text-xl leading-none my-0.5">{d.getDate()}</span>
                    <span className="text-[10px] opacity-80">{MESES[d.getMonth()]}</span>
                  </button>
                );
              })}
            </HorizontalScrollStrip>
          </section>

          {/* BARBEIROS */}
          <section>
            <h2 className="font-display text-base font-semibold mb-2.5">Selecione o barbeiro</h2>
            {barbeiros.length === 0 ? (
              <p className="text-sm text-muted-foreground">Não foi cadastrado nenhum colaborador.</p>
            ) : (
              <HorizontalScrollStrip centerOn={barbeiroId ? `[data-barbeiro="${barbeiroId}"]` : null}>
                {barbeiros.map((b) => {
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
                      className={cn(
                        "snap-start shrink-0 min-w-[8.5rem] px-4 h-14 rounded-2xl flex items-center justify-center font-semibold transition-all cursor-pointer",
                        ok ? "bg-available text-available-foreground active:scale-95" : "bg-unavailable text-unavailable-foreground opacity-90",
                        sel && ok && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                      )}
                      aria-pressed={sel && ok}
                    >
                      {b.nome}
                    </button>
                  );
                })}
              </HorizontalScrollStrip>
            )}
            {barbeiroSemDispNoDia && (
              <Card className="mt-3 p-3.5 bg-unavailable-soft border-unavailable/30 text-sm text-foreground space-y-1.5">
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
              <h2 className="font-display text-base font-semibold mb-2.5">Serviços</h2>
              <ServicosCarousel
                servicos={servicosDoBarbeiro}
                selecionados={servSel}
                onToggle={toggleServico}
              />
            </section>
          )}

          {/* HORÁRIOS */}
          <section>
            <h2 className="font-display text-base font-semibold mb-2.5">Selecione o horário</h2>
            {!barbeiroId ? (
              <p className="text-sm text-muted-foreground">Escolha um barbeiro acima para ver os horários.</p>
            ) : barbeiroSemDispNoDia ? null : precisaEscolherServico ? (
              <Card className="p-3.5 bg-muted/40 border-border text-sm text-foreground">
                Selecione um ou mais serviços acima. Os horários aparecem conforme o tempo total dos serviços.
              </Card>
            ) : semHorariosNoDia ? (
              <Card className="p-3.5 bg-unavailable-soft border-unavailable/20 text-sm text-foreground">
                Sem horários para essa data com <b>{barbeiroSel?.nome}</b>. Escolha outra data ou outro barbeiro.
              </Card>
            ) : semBlocoParaServicos ? (
              <Card className="p-3.5 bg-unavailable-soft border-unavailable/30 text-sm text-foreground space-y-2">
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
              <HorizontalScrollStrip centerOn={hora ? `[data-slot="${hora}"]` : null}>
                {slotsDoBarbeiroNoDia.all.map((s) => {
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
                      className={cn(
                        "snap-start shrink-0 w-[72px] h-12 rounded-xl flex items-center justify-center font-semibold text-sm transition-all cursor-pointer",
                        livre ? "bg-available text-available-foreground active:scale-95" : "bg-unavailable text-unavailable-foreground opacity-90",
                        sel && livre && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                      )}
                      aria-pressed={sel && livre}
                    >
                      {s}
                    </button>
                  );
                })}
              </HorizontalScrollStrip>
            )}
          </section>

          {/* DADOS */}
          <section className="space-y-3">
            <div>
              <label className="block text-sm font-semibold mb-1.5">
                {isReschedule ? "Cliente" : "Seu nome"}
              </label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como devemos te chamar"
                required
                maxLength={80}
                readOnly={isReschedule}
                className={cn("h-12 text-base", isReschedule && "bg-muted/50")}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">WhatsApp</label>
              <Input
                inputMode="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                placeholder="(11) 91234-5678"
                required
                readOnly={isReschedule}
                className={cn("h-12 text-base", isReschedule && "bg-muted/50")}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5">
                Observação <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: preferência de corte, alergia, pedido especial..."
                maxLength={500}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none"
              />
            </div>
            {!isReschedule && (
              <Card className="p-3.5 bg-card border-border">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-primary"
                    checked={wantsReminder}
                    onChange={(e) => setWantsReminder(e.target.checked)}
                  />
                  <span className="text-sm">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Bell className="h-4 w-4" />
                      Receber lembrete pelo navegador
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      Enviaremos uma confirmação 1 dia antes e um lembrete cerca de 3h antes do horário.
                    </span>
                  </span>
                </label>
                {wantsReminder && (
                  <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground space-y-1.5">
                    {iosNeedsInstall ? (
                      <>
                        <p className="font-semibold text-foreground">Atenção para iPhone</p>
                        <p>
                          Para receber notificações no iPhone, abra este link no Safari, toque em Compartilhar,
                          escolha "Adicionar à Tela de Início" e depois abra pelo ícone criado.
                        </p>
                      </>
                    ) : isIos ? (
                      <p>No iPhone, mantenha o app aberto pelo ícone instalado na tela inicial para permitir notificações.</p>
                    ) : (
                      <p>No Android, basta aceitar a permissão de notificação quando o navegador solicitar.</p>
                    )}
                    {!pushAvailable && (
                      <p className="text-unavailable">
                        Este navegador não informou suporte a notificações push. O agendamento continuará normal.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )}
          </section>

          <Button
            type="submit"
            disabled={submitting || !barbeiroId || !hora}
            className="w-full h-13 text-base font-semibold py-3.5 rounded-xl"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isReschedule ? (
              "Confirmar novo horário"
            ) : (
              "Confirmar agendamento"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default PublicBooking;
