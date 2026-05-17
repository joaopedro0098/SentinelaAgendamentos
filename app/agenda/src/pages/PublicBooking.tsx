import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { maskPhone, unmaskPhone, isValidPhone } from "@/lib/phone";
import { ArrowLeft, Check, Loader2, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServicosCarousel } from "@/components/agenda/ServicosCarousel";
import { HorizontalScrollStrip } from "@/components/agenda/HorizontalScrollStrip";
import { buildSlots, filtrarSlotsLivres } from "@/lib/slots";

interface Barbearia {
  id: string;
  nome: string;
  logo_url: string | null;
  ativa: boolean;
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

const STORAGE_KEY = "agendabarber:cliente";
const DAYS_AHEAD = 14;

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type PublicBookingProps = {
  slugOverride?: string;
  backHref?: string;
  hideMeusAgendamentos?: boolean;
};

const PublicBooking = ({ slugOverride, backHref, hideMeusAgendamentos = false }: PublicBookingProps = {}) => {
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
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const c = JSON.parse(saved);
        if (c.nome) setNome(c.nome);
        if (c.whatsapp) setWhatsapp(maskPhone(c.whatsapp));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const limite = new Date(today); limite.setDate(today.getDate() + DAYS_AHEAD);
      const fromYmd = ymd(today);
      const toYmd = ymd(limite);

      const { data: b } = await supabase
        .from("barbearias")
        .select(`
          id, nome, logo_url, ativa,
          barbeiros!inner ( id, nome, foto_url, ativo, slot_minutos,
            disponibilidades ( dia_semana, hora_inicio, hora_fim ),
            bloqueios ( data, hora_inicio, hora_fim ),
            barbeiro_services ( id, nome, duracao_minutos, ativo )
          )
        `)
        .eq("slug", slug)
        .eq("barbeiros.ativo", true)
        .maybeSingle();

      if (!b) { setBarbearia(null); setLoading(false); return; }
      setBarbearia({ id: b.id, nome: b.nome, logo_url: b.logo_url, ativa: b.ativa });

      const bbs = ((b as any).barbeiros ?? []).map((bb: any) => ({
        id: bb.id,
        nome: bb.nome,
        foto_url: bb.foto_url,
        slot_minutos: bb.slot_minutos ?? 30,
        disponibilidades: bb.disponibilidades ?? [],
        bloqueios: (bb.bloqueios ?? []).filter((bl: any) => bl.data >= fromYmd && bl.data <= toYmd),
        servicos: (bb.barbeiro_services ?? [])
          .filter((s: any) => s.ativo)
          .map((s: any) => ({ id: s.id, nome: s.nome, duracao_minutos: s.duracao_minutos })),
      })) as Barbeiro[];
      setBarbeiros(bbs);

      const bbIds = bbs.map((x) => x.id);
      if (bbIds.length) {
        const { data: ag } = await supabase
          .from("agendamentos")
          .select("barbeiro_id,data,hora,duracao_minutos")
          .eq("barbearia_id", b.id)
          .eq("status", "confirmado")
          .gte("data", fromYmd)
          .lte("data", toYmd);
        const map = new Map<string, Map<string, number>>();
        (ag ?? []).forEach((a: any) => {
          const k = `${a.barbeiro_id}|${a.data}`;
          if (!map.has(k)) map.set(k, new Map());
          map.get(k)!.set(String(a.hora).slice(0, 5), a.duracao_minutos ?? 30);
        });
        setAgOcupados(map);
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  const dias = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_AHEAD }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() + i); return d;
    });
  }, []);

  const barbeiroSel = barbeiros.find((b) => b.id === barbeiroId);
  const servicosDoBarbeiro = barbeiroSel?.servicos ?? [];

  const duracaoTotal = useMemo(() => {
    const slot = barbeiroSel?.slot_minutos ?? 30;
    const soma = servicosDoBarbeiro
      .filter((s) => servSel.includes(s.id))
      .reduce((a, s) => a + s.duracao_minutos, 0);
    return soma > 0 ? soma : slot;
  }, [servicosDoBarbeiro, servSel, barbeiroSel]);

  const slotsMatrix = useMemo(() => {
    const m = new Map<string, { all: string[]; livres: string[] }>();
    for (const bb of barbeiros) {
      const dur = bb.id === barbeiroId ? duracaoTotal : (bb.slot_minutos ?? 30);
      for (const d of dias) {
        const key = ymd(d);
        const dow = d.getDay();
        const windows = bb.disponibilidades.filter((x) => x.dia_semana === dow);
        const all = buildSlots(windows, bb.slot_minutos ?? 30);
        const dayBloqs = bb.bloqueios.filter((b) => b.data === key);
        const ocup = agOcupados.get(`${bb.id}|${key}`) ?? new Map();
        const livres = filtrarSlotsLivres(all, windows, ocup, dayBloqs, dur);
        m.set(`${bb.id}|${key}`, { all, livres });
      }
    }
    return m;
  }, [barbeiros, dias, agOcupados, barbeiroId, duracaoTotal]);

  const diaTemDisp = (k: string) =>
    barbeiros.some((b) => (slotsMatrix.get(`${b.id}|${k}`)?.livres.length ?? 0) > 0);
  const barbeiroTemDispNoDia = (bbId: string) =>
    (slotsMatrix.get(`${bbId}|${data}`)?.livres.length ?? 0) > 0;

  const slotsDoBarbeiroNoDia = barbeiroId
    ? slotsMatrix.get(`${barbeiroId}|${data}`) ?? { all: [], livres: [] }
    : { all: [] as string[], livres: [] as string[] };

  // Reseta hora ao mudar duração
  useEffect(() => { setHora(""); }, [duracaoTotal, barbeiroId, data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barbearia || !barbeiroId || !data || !hora) return toast.error("Selecione dia, barbeiro e horário");
    if (!nome.trim()) return toast.error("Informe seu nome");
    if (!isValidPhone(whatsapp)) return toast.error("WhatsApp inválido");

    setSubmitting(true);
    const whatsClean = unmaskPhone(whatsapp);
    const { data: cliId } = await supabase.rpc("upsert_cliente_por_whatsapp", {
      _barbearia_id: barbearia.id,
      _whatsapp: whatsClean,
      _nome: nome.trim(),
    });
    const { error } = await supabase.from("agendamentos").insert({
      barbearia_id: barbearia.id,
      barbeiro_id: barbeiroId,
      data,
      hora,
      cliente_nome: nome.trim(),
      cliente_whatsapp: whatsClean,
      cliente_id: cliId ?? null,
      duracao_minutos: duracaoTotal,
      status: "confirmado",
      observacao: observacao.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      if (error.code === "23505") toast.error("Esse horário acabou de ser preenchido. Escolha outro.");
      else toast.error(error.message);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nome: nome.trim(), whatsapp: whatsClean }));
    setDone(true);
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

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
      <Card className="max-w-sm w-full p-6 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-available/10 flex items-center justify-center">
          <Check className="h-6 w-6 text-available" />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold">Agendamento confirmado!</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          {barbearia.nome} aguarda você em <b className="text-foreground">{new Date(data + "T00:00:00").toLocaleDateString("pt-BR")}</b> às <b className="text-foreground">{hora}</b>.
        </p>
        <Button className="mt-6 w-full" onClick={() => { setDone(false); setHora(""); setServSel([]); setObservacao(""); }}>
          Fazer outro agendamento
        </Button>
      </Card>
    </div>
  );

  const semHorariosNoDia = barbeiroId && slotsDoBarbeiroNoDia.all.length === 0;
  const todosOcupados = barbeiroId && slotsDoBarbeiroNoDia.all.length > 0 && slotsDoBarbeiroNoDia.livres.length === 0;

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto w-full max-w-md">
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
          {/* DIAS */}
          <section>
            <h2 className="font-display text-base font-semibold mb-2.5">Selecione o dia</h2>
            <HorizontalScrollStrip className="-mx-5 px-5" centerOn={`[data-day="${data}"]`}>
              {dias.map((d) => {
                const key = ymd(d);
                const ok = diaTemDisp(key);
                const sel = key === data;
                return (
                  <button
                    key={key}
                    data-day={key}
                    type="button"
                    onClick={() => { setData(key); setBarbeiroId(""); setHora(""); setServSel([]); }}
                    className={cn(
                      "snap-start shrink-0 w-[68px] h-20 rounded-2xl flex flex-col items-center justify-center font-semibold transition-all active:scale-95",
                      ok ? "bg-available text-available-foreground" : "bg-unavailable text-unavailable-foreground opacity-90",
                      sel && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                    )}
                    aria-pressed={sel}
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
              <p className="text-sm text-muted-foreground">Nenhum barbeiro cadastrado.</p>
            ) : (
              <HorizontalScrollStrip
                className="-mx-5 px-5"
                centerOn={barbeiroId ? `[data-barbeiro="${barbeiroId}"]` : null}
              >
                {barbeiros.map((b) => {
                  const ok = barbeiroTemDispNoDia(b.id);
                  const sel = b.id === barbeiroId;
                  return (
                    <button
                      key={b.id}
                      data-barbeiro={b.id}
                      type="button"
                      onClick={() => { setBarbeiroId(b.id); setHora(""); setServSel([]); }}
                      className={cn(
                        "snap-start shrink-0 min-w-[8.5rem] px-4 h-14 rounded-2xl flex items-center justify-center font-semibold transition-all active:scale-95",
                        ok ? "bg-available text-available-foreground" : "bg-unavailable text-unavailable-foreground opacity-90",
                        sel && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                      )}
                      aria-pressed={sel}
                    >
                      {b.nome}
                    </button>
                  );
                })}
              </HorizontalScrollStrip>
            )}
          </section>

          {/* SERVIÇOS */}
          {barbeiroId && servicosDoBarbeiro.length > 0 && (
            <section>
              <h2 className="font-display text-base font-semibold mb-2.5">Serviços</h2>
              <ServicosCarousel
                servicos={servicosDoBarbeiro}
                selecionados={servSel}
                onToggle={(id) => setServSel((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])}
              />
            </section>
          )}

          {/* HORÁRIOS */}
          <section>
            <h2 className="font-display text-base font-semibold mb-2.5">Selecione o horário</h2>
            {!barbeiroId ? (
              <p className="text-sm text-muted-foreground">Escolha um barbeiro acima para ver os horários.</p>
            ) : semHorariosNoDia ? (
              <Card className="p-3.5 bg-unavailable-soft border-unavailable/20 text-sm text-foreground">
                Sem horários para essa data com <b>{barbeiroSel?.nome}</b>. Escolha outra data ou outro barbeiro.
              </Card>
            ) : todosOcupados ? (
              <Card className="p-3.5 bg-unavailable-soft border-unavailable/30 text-sm text-foreground">
                <b>Agenda lotada.</b> Escolha outro barbeiro ou outro dia.
              </Card>
            ) : (
              <HorizontalScrollStrip
                className="-mx-5 px-5"
                centerOn={hora ? `[data-slot="${hora}"]` : null}
              >
                {slotsDoBarbeiroNoDia.all.map((s) => {
                  const livre = slotsDoBarbeiroNoDia.livres.includes(s);
                  const sel = s === hora;
                  return (
                    <button
                      key={s}
                      data-slot={s}
                      type="button"
                      disabled={!livre}
                      onClick={() => livre && setHora(s)}
                      className={cn(
                        "snap-start shrink-0 w-[72px] h-12 rounded-xl flex items-center justify-center font-semibold text-sm transition-all",
                        livre ? "bg-available text-available-foreground active:scale-95" : "bg-unavailable text-unavailable-foreground opacity-90 cursor-not-allowed",
                        sel && "ring-2 ring-foreground ring-offset-2 ring-offset-surface",
                      )}
                      aria-pressed={sel}
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
              <label className="block text-sm font-semibold mb-1.5">Seu nome</label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como devemos te chamar"
                required
                maxLength={80}
                className="h-12 text-base"
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
                className="h-12 text-base"
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
          </section>

          <Button
            type="submit"
            disabled={submitting || !barbeiroId || !hora}
            className="w-full h-13 text-base font-semibold py-3.5 rounded-xl"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirmar agendamento"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default PublicBooking;
