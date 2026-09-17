import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { markAgendamentoObservacaoVista } from "@/features/dashboard/lib/agendamentoObservacaoVista";

type Props = {
  open: boolean;
  agendamentoId: string | null;
  observacao: string | null;
  clienteNome?: string;
  onClose: () => void;
  onMarkedVista?: (agendamentoId: string) => void;
};

export function AgendamentoObservacaoViewModal({
  open,
  agendamentoId,
  observacao,
  clienteNome,
  onClose,
  onMarkedVista,
}: Props) {
  const [marking, setMarking] = useState(false);

  if (!open || !observacao?.trim()) return null;

  async function handleMarkVista() {
    if (!agendamentoId) {
      onClose();
      return;
    }
    setMarking(true);
    markAgendamentoObservacaoVista(agendamentoId);
    onMarkedVista?.(agendamentoId);
    setMarking(false);
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="observacao-view-title"
        className={cn(
          "relative z-10 w-full max-w-sm rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 id="observacao-view-title" className="text-base font-semibold tracking-tight">
              Observação
            </h2>
            {clienteNome ? (
              <p className="mt-0.5 text-sm text-muted-foreground truncate">{clienteNome}</p>
            ) : null}
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

        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-foreground">
          {observacao.trim()}
        </p>

        {agendamentoId ? (
          <button
            type="button"
            disabled={marking}
            onClick={() => void handleMarkVista()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-60"
          >
            {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Marcar como visto
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
