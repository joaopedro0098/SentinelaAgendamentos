import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MESES_COMPLETOS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type Props = {
  viewMonth: Date;
  allowedMonths: { first: Date; second: Date };
  onViewMonthChange: (month: Date) => void;
  className?: string;
};

export function BookingMonthNav({ viewMonth, allowedMonths, onViewMonthChange, className }: Props) {
  const canGoPrev = viewMonth.getTime() > allowedMonths.first.getTime();
  const canGoNext = viewMonth.getTime() < allowedMonths.second.getTime();

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="w-28">
        {canGoPrev ? (
          <button
            type="button"
            onClick={() => onViewMonthChange(allowedMonths.first)}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {MESES_COMPLETOS[allowedMonths.first.getMonth()]}
          </button>
        ) : null}
      </div>
      <p className="font-display text-sm font-semibold text-center capitalize">
        {MESES_COMPLETOS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
      </p>
      <div className="w-28 text-right">
        {canGoNext ? (
          <button
            type="button"
            onClick={() => onViewMonthChange(allowedMonths.second)}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground ml-auto"
          >
            {MESES_COMPLETOS[allowedMonths.second.getMonth()]}
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
