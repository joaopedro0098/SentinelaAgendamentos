import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HorizontalScrollStrip } from "@agenda/components/agenda/HorizontalScrollStrip";

type BarbeiroTotal = {
  barbeiro_id: string;
  barbeiro_nome: string;
  total: number;
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

export default function RelatoriosPage() {
  const [dateStart, setDateStart] = useState(firstDayOfMonth);
  const [dateEnd, setDateEnd] = useState(today);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [selectedBarbeiroId, setSelectedBarbeiroId] = useState<string | null>(null);
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

  // Carrega automaticamente ao montar
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

      {/* Filtro de período */}
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

      {/* Filtro de colaborador — mesmo estilo de AgendamentosPage */}
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

      {/* Resultado */}
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
          {/* Card principal — total */}
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

          {/* Breakdown por colaborador (somente quando "Todos" selecionado e há mais de 1) */}
          {!selectedBarbeiroId && result.por_barbeiro.length > 0 && (
            <Card className="glass-panel border-border/80">
              <CardContent className="pt-5 pb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
                  Por colaborador
                </p>
                <ul className="divide-y divide-border/60">
                  {result.por_barbeiro.map((b) => (
                    <li key={b.barbeiro_id} className="flex items-center justify-between py-2.5">
                      <span className="text-sm font-medium">{b.barbeiro_nome}</span>
                      <span className="text-sm tabular-nums font-semibold text-primary">{b.total}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {/* Botão atualizar manual */}
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
