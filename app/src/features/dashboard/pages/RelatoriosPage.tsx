import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart2, ChevronDown, Clock, Loader2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";
import { formatServicePrice } from "@agenda/lib/servicePrice";
import { formatTotalServiceMinutes } from "@agenda/lib/formatDuration";
import { maskPhone } from "@agenda/lib/phone";

type BarbeiroTotal = {
  barbeiro_id: string;
  barbeiro_nome: string;
  total: number;
};

type ReportServiceDetail = {
  nome: string;
  preco_centavos: number;
};

type ReportAppointmentDetail = {
  id: string;
  data: string;
  hora: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  duracao_minutos?: number;
  servicos: ReportServiceDetail[];
};

type CollaboratorReportSummary = {
  faturamento_total_centavos: number;
  horas_trabalhadas_minutos: number;
};

type ReportResult = {
  total: number;
  por_barbeiro: BarbeiroTotal[];
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today() {
  return ymd(new Date());
}

function formatDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatServicesLine(servicos: ReportServiceDetail[]) {
  if (!servicos.length) return "—";
  return servicos
    .map((s) => {
      const price = (s.preco_centavos ?? 0) > 0 ? ` · ${formatServicePrice(s.preco_centavos)}` : "";
      return `${s.nome}${price}`;
    })
    .join(" · ");
}

function buildCollaboratorSummary(
  items: ReportAppointmentDetail[],
  fromApi?: CollaboratorReportSummary | null,
): CollaboratorReportSummary {
  if (fromApi) return fromApi;
  return {
    faturamento_total_centavos: items.reduce(
      (total, item) =>
        total + (item.servicos ?? []).reduce((sum, service) => sum + (service.preco_centavos ?? 0), 0),
      0,
    ),
    horas_trabalhadas_minutos: items.reduce((total, item) => total + (item.duracao_minutos ?? 0), 0),
  };
}

function CollaboratorReportRow({
  barbeiro,
  dateStart,
  dateEnd,
  expanded,
  onToggle,
}: {
  barbeiro: BarbeiroTotal;
  dateStart: string;
  dateEnd: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ReportAppointmentDetail[] | null>(null);
  const [summary, setSummary] = useState<CollaboratorReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalizedStart = dateStart <= dateEnd ? dateStart : dateEnd;
  const normalizedEnd = dateStart <= dateEnd ? dateEnd : dateStart;

  useEffect(() => {
    setItems(null);
    setSummary(null);
    setError(null);
  }, [normalizedStart, normalizedEnd, barbeiro.barbeiro_id]);

  useEffect(() => {
    if (!expanded || items !== null) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void supabase
      .rpc("get_relatorio_detalhes_colaborador", {
        p_data_inicio: normalizedStart,
        p_data_fim: normalizedEnd,
        p_barbeiro_id: barbeiro.barbeiro_id,
      })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        setLoading(false);

        if (rpcError) {
          setError(rpcError.message);
          return;
        }

        const payload = data as {
          items?: ReportAppointmentDetail[];
          faturamento_total_centavos?: number;
          horas_trabalhadas_minutos?: number;
          error?: string;
        } | null;
        if (payload?.error) {
          setError(payload.error);
          return;
        }

        setItems(Array.isArray(payload?.items) ? payload.items : []);
        setSummary({
          faturamento_total_centavos: payload?.faturamento_total_centavos ?? 0,
          horas_trabalhadas_minutos: payload?.horas_trabalhadas_minutos ?? 0,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [barbeiro.barbeiro_id, expanded, items, normalizedEnd, normalizedStart]);

  const displaySummary =
    items !== null ? buildCollaboratorSummary(items, summary) : null;

  return (
    <li className="rounded-xl border border-border/60 bg-background/40">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-sm font-medium truncate">{barbeiro.barbeiro_nome}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm tabular-nums font-semibold text-primary">{barbeiro.total}</span>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher detalhes" : "Ver detalhes"}
            onClick={onToggle}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/60">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando…
            </div>
          ) : error ? (
            <p className="px-3 py-3 text-xs text-destructive">{error}</p>
          ) : (
            <>
              {displaySummary && (
                <div className="grid grid-cols-2 gap-2 px-3 py-2.5 border-b border-border/40">
                  <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                      <Wallet className="h-3.5 w-3.5 shrink-0" />
                      Faturamento total
                    </div>
                    <p className="mt-1.5 text-lg font-semibold tabular-nums text-primary leading-tight">
                      {formatServicePrice(displaySummary.faturamento_total_centavos) || "R$ 0,00"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      Horas trabalhadas
                    </div>
                    <p className="mt-1.5 text-lg font-semibold tabular-nums leading-tight">
                      {formatTotalServiceMinutes(displaySummary.horas_trabalhadas_minutos)}
                    </p>
                  </div>
                </div>
              )}

              <div className="px-3 py-2 max-h-64 overflow-y-auto">
                {!items?.length ? (
                  <p className="py-3 text-xs text-muted-foreground">Nenhum atendimento no período.</p>
                ) : (
                  <ul className="space-y-3 py-1">
                    {items.map((item) => (
                      <li key={item.id} className="text-xs leading-relaxed border-b border-border/40 last:border-0 pb-3 last:pb-1">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                          <span>{formatDateBr(item.data)}</span>
                          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-current opacity-80" />
                          <span className="tabular-nums">{item.hora.slice(0, 5)}</span>
                        </div>
                        <p>
                          <span className="text-muted-foreground">Cliente: </span>
                          <span className="text-foreground">{item.cliente_nome}</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Contato: </span>
                          <span className="text-foreground">{maskPhone(item.cliente_whatsapp)}</span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">Serviço: </span>
                          <span className="text-foreground">{formatServicesLine(item.servicos ?? [])}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function RelatoriosPage() {
  const [dateStart, setDateStart] = useState(firstDayOfMonth);
  const [dateEnd, setDateEnd] = useState(today);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [selectedBarbeiroId, setSelectedBarbeiroId] = useState<string | null>(null);
  const [expandedBarbeiroId, setExpandedBarbeiroId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Relatórios — Sentinela Agendamentos";
  }, []);

  const fetchReport = useCallback(async (start: string, end: string) => {
    if (!start || !end) return;
    const normalizedStart = start <= end ? start : end;
    const normalizedEnd = start <= end ? end : start;

    setLoading(true);
    setError(null);
    setSelectedBarbeiroId(null);
    setExpandedBarbeiroId(null);

    const { data, error: rpcError } = await supabase.rpc("get_relatorio_agendamentos", {
      p_data_inicio: normalizedStart,
      p_data_fim: normalizedEnd,
    });

    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const payload = data as { total?: number; por_barbeiro?: BarbeiroTotal[]; error?: string } | null;
    if (payload?.error) {
      setError(payload.error);
      return;
    }

    setResult({
      total: payload?.total ?? 0,
      por_barbeiro: Array.isArray(payload?.por_barbeiro) ? payload.por_barbeiro : [],
    });
  }, []);

  useEffect(() => {
    void fetchReport(dateStart, dateEnd);
  }, [fetchReport, dateStart, dateEnd]);

  const filteredTotal = useMemo(() => {
    if (!result) return null;
    if (!selectedBarbeiroId) return result.total;
    return result.por_barbeiro.find((b) => b.barbeiro_id === selectedBarbeiroId)?.total ?? 0;
  }, [result, selectedBarbeiroId]);

  const periodLabel = useMemo(() => {
    if (!dateStart || !dateEnd) return "";
    const s = dateStart <= dateEnd ? dateStart : dateEnd;
    const e = dateStart <= dateEnd ? dateEnd : dateStart;
    if (s === e) return formatDateBr(s);
    return `${formatDateBr(s)} — ${formatDateBr(e)}`;
  }, [dateStart, dateEnd]);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 pb-10 w-full overflow-x-hidden">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-primary" />
          Relatórios
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agendamentos confirmados por período e colaborador.
        </p>
      </header>

      <Card className="glass-panel border-border/80">
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rel-start">Data início</Label>
              <Input
                id="rel-start"
                type="date"
                value={dateStart}
                max={dateEnd || undefined}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rel-end">Data fim</Label>
              <Input
                id="rel-end"
                type="date"
                value={dateEnd}
                min={dateStart || undefined}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {result && result.por_barbeiro.length > 1 && (
        <section>
          <h2 className="text-sm font-semibold mb-2.5">Colaborador</h2>
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
            {result.por_barbeiro.map((b) => {
              const sel = b.barbeiro_id === selectedBarbeiroId;
              return (
                <button
                  key={b.barbeiro_id}
                  type="button"
                  data-barbeiro={b.barbeiro_id}
                  onClick={() => setSelectedBarbeiroId(sel ? null : b.barbeiro_id)}
                  className={cn(
                    "snap-start shrink-0 min-w-[7rem] px-4 h-11 rounded-full text-sm font-semibold transition-all",
                    sel
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  {b.barbeiro_nome}
                </button>
              );
            })}
          </HorizontalScrollStrip>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando…</span>
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardContent className="py-8 text-center text-sm text-destructive">
            Erro ao carregar relatório: {error}
          </CardContent>
        </Card>
      ) : result ? (
        <div className="space-y-4">
          <Card className="glass-panel border-border/80">
            <CardContent className="pt-6 pb-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                {selectedBarbeiroId
                  ? result.por_barbeiro.find((b) => b.barbeiro_id === selectedBarbeiroId)?.barbeiro_nome
                  : "Total geral"}
              </p>
              <p className="text-5xl font-bold tabular-nums text-primary leading-none">
                {filteredTotal ?? 0}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                agendamento{(filteredTotal ?? 0) !== 1 ? "s" : ""} confirmado{(filteredTotal ?? 0) !== 1 ? "s" : ""}
                {periodLabel ? ` · ${periodLabel}` : ""}
              </p>
            </CardContent>
          </Card>

          {!selectedBarbeiroId && result.por_barbeiro.length > 0 && (
            <Card className="glass-panel border-border/80">
              <CardContent className="pt-5 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
                  Por colaborador
                </p>
                <ul className="space-y-2">
                  {result.por_barbeiro.map((b) => (
                    <CollaboratorReportRow
                      key={b.barbeiro_id}
                      barbeiro={b}
                      dateStart={dateStart}
                      dateEnd={dateEnd}
                      expanded={expandedBarbeiroId === b.barbeiro_id}
                      onToggle={() =>
                        setExpandedBarbeiroId((current) => (current === b.barbeiro_id ? null : b.barbeiro_id))
                      }
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full"
          disabled={loading}
          onClick={() => void fetchReport(dateStart, dateEnd)}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Atualizar
        </Button>
      </div>
    </div>
  );
}
