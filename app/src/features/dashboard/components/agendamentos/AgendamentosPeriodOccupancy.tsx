import { cn } from "@/lib/utils";
import type { DaySlotStats } from "@/features/dashboard/lib/agendamentosSlotStats";
import {
  getOccupancyRingTone,
  occupancyPercent,
} from "@/features/dashboard/lib/agendamentosSlotStats";
import { MonthDayStatusBadge } from "@/features/dashboard/components/agendamentos/SlotOccupancyRing";

type Props = {
  stats: DaySlotStats;
  label: string;
  className?: string;
};

const BAR_TONE_CLASS = {
  green: "bg-available",
  yellow: "bg-yellow-500",
  red: "bg-unavailable",
} as const;

const PCT_TONE_CLASS = {
  green: "text-available",
  yellow: "text-yellow-600 dark:text-yellow-400",
  red: "text-unavailable",
} as const;

export function AgendamentosPeriodOccupancy({ stats, label, className }: Props) {
  const pct = occupancyPercent(stats);
  const tone = getOccupancyRingTone(stats);

  return (
    <div className={cn("flex min-w-[11rem] flex-col items-end gap-1.5 shrink-0", className)}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums text-foreground">
        {stats.occupied}/{stats.total}
      </span>

      {stats.status === "open" ? (
        <div className="flex w-full items-center gap-2.5">
          <span
            className={cn(
              "w-10 shrink-0 text-right text-sm font-bold tabular-nums leading-none",
              PCT_TONE_CLASS[tone],
            )}
          >
            {pct}%
          </span>
          <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-border/55">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300",
                BAR_TONE_CLASS[tone],
              )}
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${pct}% de ocupação`}
            />
          </div>
        </div>
      ) : (
        <MonthDayStatusBadge
          status={stats.status}
          className="px-3.5 py-1.5 text-xs"
        />
      )}
    </div>
  );
}
