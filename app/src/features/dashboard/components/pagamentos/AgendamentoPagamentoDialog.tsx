import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgendamentoPagamentoFlow } from "@/features/dashboard/components/pagamentos/AgendamentoPagamentoFlow";

type Props = {
  open: boolean;
  agendamentoId: string | null;
  subtitle?: string;
  onClose: () => void;
};

/** Visualização de pagamento (aba Pacientes — sem upload). */
export function AgendamentoPagamentoDialog({ open, agendamentoId, subtitle, onClose }: Props) {
  if (!open || !agendamentoId) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-sm rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Pagamento</h2>
            {subtitle ? <p className="text-sm text-muted-foreground truncate">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <AgendamentoPagamentoFlow
          agendamentoId={agendamentoId}
          initialScreen="info"
          allowUpload={false}
          skipHomeScreen
          onRequestClose={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}
