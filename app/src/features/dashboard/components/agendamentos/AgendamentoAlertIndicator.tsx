import { cn } from "@/lib/utils";

type Props = {
  show: boolean;
  className?: string;
};

/** Bolinha amarela: alerta pendente e/ou observação não vista. O clique é no card inteiro. */
export function AgendamentoNotificationDot({ show, className }: Props) {
  if (!show) return null;
  return (
    <span
      className={cn("pointer-events-none flex items-center justify-center p-1", className)}
      aria-hidden
      title="Nova mensagem ou observação"
    >
      <span className="block h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-background dark:bg-amber-500" />
    </span>
  );
}

/** @deprecated Use AgendamentoNotificationDot */
export const AgendamentoAlertIndicator = AgendamentoNotificationDot;
