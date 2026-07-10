import { cn } from "@/lib/utils";
import {
  getOccupancyRingTone,
  type DaySlotDisplayStatus,
  type OccupancyRingTone,
} from "@/features/dashboard/lib/agendamentosSlotStats";

type Props = {
  occupied: number;
  total: number;
  status?: DaySlotDisplayStatus;
  size?: number;
  strokeWidth?: number;
  textClassName?: string;
  className?: string;
};

const RING_TONE_CLASS: Record<OccupancyRingTone, string> = {
  green: "stroke-available",
  yellow: "stroke-yellow-500",
  red: "stroke-unavailable",
};

export function SlotOccupancyRing({
  occupied,
  total,
  status = "open",
  size = 48,
  strokeWidth = 3,
  textClassName = "text-[10px]",
  className,
}: Props) {
  const pct = total > 0 ? Math.min(1, Math.max(0, occupied / total)) : 0;
  const tone = getOccupancyRingTone({ occupied, total, status });
  const stroke = strokeWidth;
  const r = (size - stroke * 2) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct);

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-label={`${occupied} de ${total} horários ocupados`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border/50"
        />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={cn("transition-[stroke-dashoffset] duration-300", RING_TONE_CLASS[tone])}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-semibold tabular-nums leading-none text-foreground",
          textClassName,
        )}
      >
        {occupied}/{total}
      </span>
    </div>
  );
}

export function MonthDayStatusBadge({
  status,
  className,
  noShiftClassName,
}: {
  status: DaySlotDisplayStatus;
  className?: string;
  noShiftClassName?: string;
}) {
  if (status === "no_shift") {
    return (
      <span
        className={cn(
          "rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground",
          noShiftClassName,
        )}
      >
        Sem expediente
      </span>
    );
  }

  if (status === "full") {
    return (
      <span
        className={cn(
          "rounded-full bg-unavailable px-2.5 py-1 text-[10px] font-semibold text-unavailable-foreground",
          className,
        )}
      >
        Lotado
      </span>
    );
  }

  return null;
}
