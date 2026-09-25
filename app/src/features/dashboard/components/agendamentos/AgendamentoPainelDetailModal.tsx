import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHoraPainel } from "@/features/dashboard/lib/pacienteFormat";
import { hasAgendamentoObservacao } from "@/features/dashboard/components/agendamentos/AgendamentoObsIndicator";
import { AgendamentoPagamentoFlow } from "@/features/dashboard/components/pagamentos/AgendamentoPagamentoFlow";
import { markAgendamentoObservacaoVista } from "@/features/dashboard/lib/agendamentoObservacaoVista";

type Props = {
  open: boolean;
  agendamentoId: string | null;
  clienteNome: string;
  data: string;
  hora: string;
  observacao: string | null;
  onClose: () => void;
  onObservacaoMarkedVista?: (agendamentoId: string) => void;
};

export function AgendamentoPainelDetailModal({
  open,
  agendamentoId,
  clienteNome,
  data,
  hora,
  observacao,
  onClose,
  onObservacaoMarkedVista,
}: Props) {
  if (!open || !agendamentoId) return null;

  const showObs = hasAgendamentoObservacao(observacao);

  function handleClose() {
    if (showObs) {
      markAgendamentoObservacaoVista(agendamentoId!);
      onObservacaoMarkedVista?.(agendamentoId!);
    }
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight truncate">{clienteNome}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {data} · {formatHoraPainel(hora)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={handleClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showObs ? (
          <div className="mb-4 rounded-lg bg-secondary/30 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Observação</p>
            <p className="text-sm whitespace-pre-wrap break-words">{observacao!.trim()}</p>
          </div>
        ) : null}

        <AgendamentoPagamentoFlow agendamentoId={agendamentoId} allowUpload />
      </div>
    </div>,
    document.body,
  );
}
