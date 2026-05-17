import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, Loader2, MessageSquare, Phone, User } from "lucide-react";
import { supabase } from "@agenda/integrations/supabase/client";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";
import { useAuth } from "@/hooks/useAuth";
import { supabase as appSupabase } from "@/integrations/supabase/client";
import { useEnsureAgendaSync } from "@/features/agenda/hooks/useEnsureAgendaSync";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  observacao: string | null;
  barbeiro_id: string;
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
  const { user } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [barbeariaId, setBarbeariaId] = useState<string | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [agendamentos, setAgendamentos] = useState<AgendamentoRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [selectedBarbeiroId, setSelectedBarbeiroId] = useState<string | null>(null);

  const { phase } = useEnsureAgendaSync(slug ?? undefined);

  const dias = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const total = DAYS_BACK + DAYS_AHEAD + 1;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - DAYS_BACK + i);
      return d;
    });
  }, []);

  useEffect(() => {
    document.title = "Agendamentos - Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoadingShop(true);
      const { data } = await appSupabase
        .from("barbershops")
        .select("slug")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (active) {
        setSlug(data?.slug ?? null);
        setLoadingShop(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!slug || phase !== "ready") return;
    let active = true;
    (async () => {
      const { data } = await supabase.from("barbearias").select("id").eq("slug", slug).maybeSingle();
      if (active) setBarbeariaId(data?.id ?? null);
    })();
    return () => {
      active = false;
    };
  }, [slug, phase]);

  const loadAgendamentos = useCallback(async () => {
    if (!barbeariaId) return;
    setLoadingList(true);
    const { data, error } = await supabase
      .from("agendamentos")
      .select(
        "id, data, hora, cliente_nome, cliente_whatsapp, duracao_minutos, observacao, barbeiro_id, barbeiros ( id, nome )",
      )
      .eq("barbearia_id", barbeariaId)
      .eq("data", selectedDate)
      .eq("status", "confirmado")
      .order("hora", { ascending: true });

    if (!error) setAgendamentos((data ?? []) as AgendamentoRow[]);
    setLoadingList(false);
  }, [barbeariaId, selectedDate]);

  useEffect(() => {
    loadAgendamentos();
  }, [loadAgendamentos]);

  useEffect(() => {
    if (!barbeariaId) return;
    const channel = supabase
      .channel(`painel-agendamentos:${barbeariaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `barbearia_id=eq.${barbeariaId}`,
        },
        () => {
          loadAgendamentos();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [barbeariaId, loadAgendamentos]);

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

  const dataLabel = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  }, [selectedDate]);

  function handleDayClick(key: string) {
    if (key === selectedDate) {
      setSelectedBarbeiroId(null);
    } else {
      setSelectedDate(key);
      setSelectedBarbeiroId(null);
    }
  }

  if (loadingShop || phase === "loading") {
    return (
      <div className="p-4 md:p-6 flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando agendamentos...</p>
      </div>
    );
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
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 pb-10">
      <header className="pr-12">
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
        <HorizontalScrollStrip className="-mx-1" centerOn={`[data-day="${selectedDate}"]`}>
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

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {selectedBarbeiroId
              ? `Horários — ${barbeirosNoDia.find((b) => b.id === selectedBarbeiroId)?.nome ?? ""}`
              : "Todos os agendamentos do dia"}
          </h2>
          {!loadingList && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {listaFiltrada.length} {listaFiltrada.length === 1 ? "agendamento" : "agendamentos"}
            </span>
          )}
        </div>

        {loadingList ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : listaFiltrada.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum agendamento confirmado para este dia
              {selectedBarbeiroId ? " com este colaborador" : ""}.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {listaFiltrada.map((a) => (
              <li key={a.id}>
                <Card className="overflow-hidden border-border/80">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-primary font-semibold tabular-nums">
                        <Clock className="h-4 w-4 shrink-0" />
                        <span className="text-lg">{formatHora(a.hora)}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          · {a.duracao_minutos} min
                        </span>
                      </div>
                      {!selectedBarbeiroId && a.barbeiros?.nome && (
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0">
                          {a.barbeiros.nome}
                        </span>
                      )}
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
            ))}
          </ul>
        )}
      </section>
    </div>
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
