import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasAgendamentoObservacao } from "@/features/dashboard/components/agendamentos/AgendamentoObsIndicator";
import { AgendamentoPainelPagamentoDetail } from "@/features/dashboard/components/pagamentos/AgendamentoPainelPagamentoDetail";
import { markAgendamentoObservacaoVista } from "@/features/dashboard/lib/agendamentoObservacaoVista";

type Props = {
  open: boolean;
  agendamentoId: string | null;
  clienteNome: string;
  hora: string;
  data?: string;
  observacao: string | null;
  onClose: () => void;
  onObservacaoMarkedVista?: (agendamentoId: string) => void;
};

export function AgendamentoPainelDetailModal({
  open,
  agendamentoId,
  clienteNome: _clienteNome,
  hora: _hora,
  data: _data,
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
          "relative z-10 flex w-full max-w-md flex-col rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150 min-h-[14rem] max-h-[90vh]",
        )}
      >
        <div className="flex justify-end shrink-0 -mt-1 -mr-1 mb-2">
          <button
            type="button"
            aria-label="Fechar"
            onClick={handleClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {showObs ? (
          <div className="mb-4 rounded-lg bg-secondary/30 px-3 py-2 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-1">Observação</p>
            <p className="text-sm whitespace-pre-wrap break-words">{observacao!.trim()}</p>
          </div>
        ) : null}

        <AgendamentoPainelPagamentoDetail agendamentoId={agendamentoId} allowUpload />
      </div>
    </div>,
    document.body,
  );
}
