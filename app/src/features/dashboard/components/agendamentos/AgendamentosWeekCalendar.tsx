import { cn } from "@/lib/utils";
import { getWeekRange, parseYmd, ymd } from "@/features/dashboard/lib/agendamentosPanel";
import type { DaySlotStats } from "@/features/dashboard/lib/agendamentosSlotStats";
import { MonthDayStatusBadge, SlotOccupancyRing } from "@/features/dashboard/components/agendamentos/SlotOccupancyRing";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Props = {
  anchorYmd: string;
  dayStats: Map<string, DaySlotStats>;
  selectedDayYmd: string;
  onDayClick: (dayYmd: string) => void;
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function AgendamentosWeekCalendar({
  anchorYmd,
  dayStats,
  selectedDayYmd,
  onDayClick,
}: Props) {
  const { start } = getWeekRange(parseYmd(anchorYmd));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="mb-3 grid grid-cols-7 gap-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 gap-3">
        {days.map((day) => {
          const key = ymd(day);
          const stats: DaySlotStats = dayStats.get(key) ?? { occupied: 0, total: 0, status: "no_shift" };
          const isToday = isSameDay(day, today);
          const isSelected = key === selectedDayYmd;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick(key)}
              className={cn(
                "flex min-h-[10rem] flex-col items-center justify-between rounded-xl border border-border/60 p-3 transition-colors",
                "hover:bg-secondary/30 hover:border-border",
                isSelected && "border-accent/70 bg-accent/5 ring-1 ring-accent/30",
                isToday && !isSelected && "ring-1 ring-primary/35",
              )}
            >
              <span
                className={cn(
                  "self-start text-sm font-semibold tabular-nums",
                  isToday ? "text-accent" : "text-muted-foreground",
                )}
              >
                {day.getDate()}
              </span>
              {stats.status === "open" ? (
                <SlotOccupancyRing
                  occupied={stats.occupied}
                  total={stats.total}
                  status={stats.status}
                  size={64}
                  strokeWidth={5}
                  textClassName="text-xs"
                />
              ) : (
                <MonthDayStatusBadge
                  status={stats.status}
                  className="text-[11px]"
                  noShiftClassName="px-3.5 py-2 text-sm leading-snug"
                />
              )}
              <span className="h-3" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
