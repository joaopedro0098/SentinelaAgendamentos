import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  disabled?: boolean;
};

export function AgendamentoActionsMenu({ children, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label="Ações do agendamento"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-1 min-w-[11rem] rounded-xl border border-border/80 bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function AgendamentoMenuAction({
  label,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
        destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-secondary/60",
      )}
    >
      {label}
    </button>
  );
}

export function AgendamentoMenuActionLoading() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Processando…
    </div>
  );
}
