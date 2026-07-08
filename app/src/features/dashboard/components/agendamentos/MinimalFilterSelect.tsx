import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
};

export function MinimalFilterSelect({ label, value, options, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = value !== "todos";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2.5 text-sm transition-colors hover:bg-secondary/40",
          isActive && "border-accent/40 bg-accent/5",
        )}
        aria-expanded={open}
        aria-label={`Filtrar por ${label.toLowerCase()}`}
      >
        <span className={cn("font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>{label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border/80 bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
          role="listbox"
        >
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60",
                  opt.value === value && "bg-secondary/50 font-medium",
                )}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
