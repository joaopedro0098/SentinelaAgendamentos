import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isDayInRange,
  monthStart,
  normalizeDateRange,
  type DateRangeYmd,
  ymd,
} from "@/features/dashboard/lib/agendamentosPanel";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

type DayButtonContext = { selected: boolean; today: boolean };

type Props = {
  range: DateRangeYmd;
  onRangeChange: (range: DateRangeYmd) => void;
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

function dayYmdAtPointer(clientX: number, clientY: number): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    if (!(el instanceof Element)) continue;
    const ymdAttr = el.closest("[data-day-ymd]")?.getAttribute("data-day-ymd");
    if (ymdAttr) return ymdAttr;
  }
  return null;
}

export function AgendamentosMiniCalendar({
  range,
  onRangeChange,
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

  const dragRef = useRef<{ originYmd: string; dragging: boolean; pointerId: number } | null>(null);
  const [previewRange, setPreviewRange] = useState<DateRangeYmd | null>(null);
  /** Mão fechada enquanto o botão do mouse estiver pressionado nos dias. */
  const [isPointerDown, setIsPointerDown] = useState(false);

  const visibleRange = previewRange ?? range;

  useEffect(() => {
    if (!isPointerDown) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [isPointerDown]);

  const finishPointer = useCallback(
    (pointerId: number, targetYmd: string | null) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== pointerId) return;

      if (session.dragging && targetYmd) {
        onRangeChange(normalizeDateRange(session.originYmd, targetYmd));
      } else {
        onRangeChange({ startYmd: session.originYmd, endYmd: session.originYmd });
      }

      dragRef.current = null;
      setPreviewRange(null);
      setIsPointerDown(false);
    },
    [onRangeChange],
  );

  const handlePointerDown = useCallback(
    (dayYmd: string, e: React.PointerEvent<HTMLButtonElement>) => {
      if (isDayDisabled?.(dayYmd)) return;
      e.preventDefault();
      setIsPointerDown(true);
      dragRef.current = { originYmd: dayYmd, dragging: false, pointerId: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const session = dragRef.current;
        if (!session || ev.pointerId !== session.pointerId) return;
        const hoverYmd = dayYmdAtPointer(ev.clientX, ev.clientY);
        if (!hoverYmd || isDayDisabled?.(hoverYmd)) return;
        if (hoverYmd !== session.originYmd) {
          session.dragging = true;
          setPreviewRange(normalizeDateRange(session.originYmd, hoverYmd));
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (dragRef.current?.pointerId !== ev.pointerId) return;
        const targetYmd = dayYmdAtPointer(ev.clientX, ev.clientY) ?? dragRef.current.originYmd;
        finishPointer(ev.pointerId, targetYmd);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [finishPointer, isDayDisabled],
  );

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card/50 p-3 select-none", className)}>
      <div className="flex items-center justify-between mb-3 cursor-default">
        <button
          type="button"
          disabled={disablePrevMonth}
          className={cn(
            "text-sm px-2 py-1 rounded-lg hover:bg-secondary/60 cursor-pointer",
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
            "text-sm px-2 py-1 rounded-lg hover:bg-secondary/60 cursor-pointer",
            disableNextMonth && "opacity-40 pointer-events-none",
          )}
          onClick={() => onMonthChange(1)}
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground mb-1 cursor-default">
        {WEEKDAYS.map((w, idx) => (
          <span key={`${w}-${idx}`}>{w}</span>
        ))}
      </div>
      <div
        className={cn(
          "grid grid-cols-7 gap-1",
          isPointerDown ? "[&_[data-day-ymd]]:!cursor-grabbing" : "[&_[data-day-ymd]]:!cursor-grab",
        )}
      >
        {cells.map((day, i) => {
          if (!day) return <span key={`e-${i}`} />;
          const key = ymd(day);
          const selected = isDayInRange(key, visibleRange);
          const today = isSameDay(day, new Date());
          const disabled = isDayDisabled?.(key) ?? false;
          const extraClassName = getDayExtraClassName?.(key, { selected, today });
          return (
            <button
              key={key}
              type="button"
              data-day-ymd={key}
              disabled={disabled}
              onPointerDown={(e) => handlePointerDown(key, e)}
              className={cn(
                "h-8 w-8 mx-auto rounded-lg text-xs font-medium transition-colors touch-none !cursor-grab",
                isPointerDown && !disabled && "!cursor-grabbing",
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
