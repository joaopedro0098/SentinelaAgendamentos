import { cn } from "@/lib/utils";
import { ymd } from "@/features/dashboard/lib/agendamentosPanel";
import type { DaySlotStats } from "@/features/dashboard/lib/agendamentosSlotStats";
import { SlotOccupancyRing } from "@/features/dashboard/components/agendamentos/SlotOccupancyRing";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Props = {
  displayMonth: Date;
  dayStats: Map<string, DaySlotStats>;
  selectedDayYmd: string;
  onDayClick: (dayYmd: string) => void;
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function AgendamentosMonthCalendar({
  displayMonth,
  dayStats,
  selectedDayYmd,
  onDayClick,
}: Props) {
  const first = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(displayMonth.getFullYear(), displayMonth.getMonth(), d));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="mb-3 grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-2">
        {cells.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="min-h-[5.5rem]" aria-hidden />;
          }

          const key = ymd(day);
          const stats = dayStats.get(key) ?? { occupied: 0, total: 0 };
          const isToday = isSameDay(day, today);
          const isSelected = key === selectedDayYmd;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick(key)}
              className={cn(
                "flex min-h-[5.5rem] flex-col items-center justify-between rounded-xl border border-border/60 p-2 transition-colors",
                "hover:bg-secondary/30 hover:border-border",
                isSelected && "border-accent/70 bg-accent/5 ring-1 ring-accent/30",
                isToday && !isSelected && "ring-1 ring-primary/35",
              )}
            >
              <span
                className={cn(
                  "self-start text-xs font-semibold tabular-nums",
                  isToday ? "text-accent" : "text-muted-foreground",
                )}
              >
                {day.getDate()}
              </span>
              <SlotOccupancyRing occupied={stats.occupied} total={stats.total} size={52} />
              <span className="h-3" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
