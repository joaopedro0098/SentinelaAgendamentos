import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  observacao: string | null;
  clienteNome?: string;
  onClose: () => void;
};

export function AgendamentoObservacaoViewModal({
  open,
  observacao,
  clienteNome,
  onClose,
}: Props) {
  if (!open || !observacao?.trim()) return null;

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
      </div>
    </div>,
    document.body,
  );
}
