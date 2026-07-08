import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MESES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatMonthYearLabel(date: Date) {
  const month = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${month}/${date.getFullYear()}`;
}

type Props = {
  viewMonth: Date;
  onMonthShift: (delta: number) => void;
  onPickMonth: (year: number, monthIndex: number) => void;
};

export function AgendamentosMobileMonthNav({ viewMonth, onMonthShift, onPickMonth }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(viewMonth.getFullYear());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setPickerYear(viewMonth.getFullYear());
  }, [open, viewMonth]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 10;
  const maxYear = currentYear + 2;

  return (
    <div ref={rootRef} className="relative mb-3 flex items-center justify-center">
      <div className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-card/60 px-1 py-0.5">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => onMonthShift(-1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
          className="min-w-[8.5rem] px-2 py-1.5 text-sm font-medium capitalize text-foreground transition-colors hover:bg-secondary/40 rounded-lg"
        >
          {formatMonthYearLabel(viewMonth)}
        </button>

        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => onMonthShift(1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {open ? (
        <div
          className="absolute left-1/2 top-full z-40 mt-2 w-[15.5rem] -translate-x-1/2 rounded-xl border border-border/80 bg-popover p-3 shadow-lg"
          role="dialog"
          aria-label="Selecionar mês e ano"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Ano anterior"
              disabled={pickerYear <= minYear}
              onClick={() => setPickerYear((y) => Math.max(minYear, y - 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
            <button
              type="button"
              aria-label="Próximo ano"
              disabled={pickerYear >= maxYear}
              onClick={() => setPickerYear((y) => Math.min(maxYear, y + 1))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MESES.map((label, monthIndex) => {
              const selected =
                viewMonth.getFullYear() === pickerYear && viewMonth.getMonth() === monthIndex;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onPickMonth(pickerYear, monthIndex);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                    selected
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-secondary/60",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
