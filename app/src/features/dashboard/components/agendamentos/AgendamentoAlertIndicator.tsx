import { cn } from "@/lib/utils";

type Props = {
  show: boolean;
  className?: string;
  onClick: () => void;
};

/** Bolinha vermelha no card do agendamento: existe um alerta "pendente" (cancelamento/alteração via WhatsApp). */
export function AgendamentoAlertIndicator({ show, className, onClick }: Props) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("flex items-center justify-center p-1", className)}
      aria-label="Ver alerta do paciente"
      title="Paciente solicitou cancelamento ou alteração"
    >
      <span className="block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" aria-hidden />
    </button>
  );
}
