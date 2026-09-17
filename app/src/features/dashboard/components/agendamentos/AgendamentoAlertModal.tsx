import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, TriangleAlert, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type AlertRow = {
  id: string;
  agendamento_id: string;
  tipo: "cancelamento" | "alteracao";
  mensagem: string;
  status: "pendente" | "resolvido";
  criado_em: string;
  resolvido_em: string | null;
};

type Props = {
  open: boolean;
  agendamentoId: string | null;
  clienteNome?: string;
  observacao?: string | null;
  onClose: () => void;
  /** Chamado quando um alerta é marcado como resolvido (para o painel atualizar has_pending_alert). */
  onResolved?: (agendamentoId: string) => void;
};

function formatDateTimeBr(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AgendamentoAlertModal({
  open,
  agendamentoId,
  clienteNome,
  observacao,
  onClose,
  onResolved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!open || !agendamentoId) {
      setAlert(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("list_agendamento_alerts", {
        p_agendamento_id: agendamentoId,
      });
      if (cancelled) return;
      if (error) {
        toast({ title: "Não foi possível carregar o alerta", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const row = data as { error?: string; items?: AlertRow[] } | null;
      const items = Array.isArray(row?.items) ? row.items : [];
      const pending = items.find((item) => item.status === "pendente");
      setAlert(pending ?? items[0] ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, agendamentoId]);

  async function handleResolve() {
    if (!alert) return;
    setResolving(true);
    try {
      const { data, error } = await supabase.rpc("resolve_agendamento_alert", { p_alert_id: alert.id });
      if (error) throw error;
      const row = data as { error?: string } | null;
      if (row?.error) throw new Error(row.error);
      setAlert((prev) => (prev ? { ...prev, status: "resolvido", resolvido_em: new Date().toISOString() } : prev));
      onResolved?.(alert.agendamento_id);
      toast({ title: "Marcado como visto" });
    } catch (error) {
      toast({
        title: "Não foi possível resolver o alerta",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setResolving(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agendamento-alert-title"
        className={cn(
          "relative z-10 w-full max-w-sm rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 id="agendamento-alert-title" className="text-base font-semibold tracking-tight flex items-center gap-1.5">
              <TriangleAlert className="h-4 w-4 text-amber-500" aria-hidden />
              Mensagem do agendamento
            </h2>
            {clienteNome ? <p className="mt-0.5 text-sm text-muted-foreground truncate">{clienteNome}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : !alert && !observacao?.trim() ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada para este agendamento.</p>
        ) : (
          <div className="space-y-4">
            {alert ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {alert.tipo === "cancelamento" ? "Cancelamento via WhatsApp" : "Remarcar via WhatsApp"}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{alert.mensagem}</p>
                <p className="text-xs text-muted-foreground">Recebido em {formatDateTimeBr(alert.criado_em)}</p>

                {alert.status === "pendente" ? (
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => void handleResolve()}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-60"
                  >
                    {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Marcar como visto
                  </button>
                ) : (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Visto em {formatDateTimeBr(alert.resolvido_em!)}
                  </p>
                )}
              </div>
            ) : null}

            {observacao?.trim() ? (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Observação</p>
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm text-foreground">
                  {observacao.trim()}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
