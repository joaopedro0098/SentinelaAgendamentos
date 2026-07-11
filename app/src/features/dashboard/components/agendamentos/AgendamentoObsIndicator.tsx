import { cn } from "@/lib/utils";

export function hasAgendamentoObservacao(observacao: string | null | undefined) {
  return Boolean(observacao?.trim());
}

type Props = {
  observacao: string | null | undefined;
  className?: string;
  onClick: () => void;
};

export function AgendamentoObsIndicator({ observacao, className, onClick }: Props) {
  if (!hasAgendamentoObservacao(observacao)) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "text-[10px] font-extralight tracking-wide text-available transition-colors hover:text-available/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-available/40 rounded-sm",
        className,
      )}
      aria-label="Ver observação"
    >
      OBS
    </button>
  );
}
