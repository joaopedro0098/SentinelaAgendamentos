import { cn } from "@/lib/utils";
import { parseYmd, ymd, monthStart, type ViewMode, getWeekRange } from "@/features/dashboard/lib/agendamentosPanel";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

type DayButtonContext = { selected: boolean; today: boolean };

type Props = {
  viewMode: ViewMode;
  anchorYmd: string;
  onAnchorChange: (ymd: string) => void;
  onMonthChange: (delta: number) => void;
  displayMonth: Date;
  className?: string;
  isDayDisabled?: (dayYmd: string) => boolean;
  getDayExtraClassName?: (dayYmd: string, ctx: DayButtonContext) => string | undefined;
  disablePrevMonth?: boolean;
  disableNextMonth?: boolean;
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(dayYmd: string, anchorYmd: string, viewMode: ViewMode) {
  if (viewMode === "dia") return dayYmd === anchorYmd;
  const anchor = parseYmd(anchorYmd);
  const day = parseYmd(dayYmd);
  if (viewMode === "semana") {
    const { start, end } = getWeekRange(anchor);
    return day >= start && day <= end;
  }
  return day.getMonth() === anchor.getMonth() && day.getFullYear() === anchor.getFullYear();
}

export function AgendamentosMiniCalendar({
  viewMode,
  anchorYmd,
  onAnchorChange,
  onMonthChange,
  displayMonth,
  className,
  isDayDisabled,
  getDayExtraClassName,
  disablePrevMonth = false,
  disableNextMonth = false,
}: Props) {
  const first = monthStart(displayMonth);
  const startPad = first.getDay();
  const daysInMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(displayMonth.getFullYear(), displayMonth.getMonth(), d));
  }

  const monthLabel = displayMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card/50 p-3", className)}>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          disabled={disablePrevMonth}
          className={cn(
            "text-sm px-2 py-1 rounded-lg hover:bg-secondary/60",
            disablePrevMonth && "opacity-40 pointer-events-none",
          )}
          onClick={() => onMonthChange(-1)}
        >
          ‹
        </button>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <button
          type="button"
          disabled={disableNextMonth}
          className={cn(
            "text-sm px-2 py-1 rounded-lg hover:bg-secondary/60",
            disableNextMonth && "opacity-40 pointer-events-none",
          )}
          onClick={() => onMonthChange(1)}
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <span key={`e-${i}`} />;
          const key = ymd(day);
          const selected = isInRange(key, anchorYmd, viewMode);
          const today = isSameDay(day, new Date());
          const disabled = isDayDisabled?.(key) ?? false;
          const extraClassName = getDayExtraClassName?.(key, { selected, today });
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onAnchorChange(key)}
              className={cn(
                "h-8 w-8 mx-auto rounded-lg text-xs font-medium transition-colors",
                disabled && "opacity-30 pointer-events-none",
                !disabled && !extraClassName && selected && "bg-accent text-accent-foreground",
                !disabled && !extraClassName && !selected && "hover:bg-secondary/60",
                !disabled && !extraClassName && today && !selected && "ring-1 ring-primary/40",
                extraClassName,
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
