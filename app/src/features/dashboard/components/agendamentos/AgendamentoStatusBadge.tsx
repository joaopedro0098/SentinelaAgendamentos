import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStatusKind,
  type AgendamentoPainelItem,
  type AgendamentoStatusKind,
  type AgendamentoStatusMenuAction,
} from "@/features/dashboard/lib/agendamentosPanel";

type StatusAction = "confirmar" | "nao_confirmado" | "cancelar";

const ACTION_LABELS: Record<StatusAction, string> = {
  confirmar: "Confirmar",
  nao_confirmado: "Não confirmado",
  cancelar: "Cancelar",
};

const ACTIONS_BY_KIND: Record<Exclude<AgendamentoStatusKind, "faltou" | "concluido">, StatusAction[]> = {
  nao_confirmado: ["confirmar", "cancelar"],
  confirmado: ["nao_confirmado", "cancelar"],
  cancelado: ["confirmar", "nao_confirmado"],
};

function badgeToneClass(kind: AgendamentoStatusKind) {
  switch (kind) {
    case "cancelado":
      return "bg-unavailable/25 text-unavailable border-unavailable/90 dark:text-red-100";
    case "faltou":
      return "bg-absent/25 text-absent border-absent/90 dark:text-gray-200";
    case "nao_confirmado":
      return "bg-yellow-400/25 text-yellow-950 border-yellow-500/90 dark:text-yellow-100";
    case "concluido":
      return "bg-completed/25 text-completed border-completed/90 dark:text-blue-100";
    case "confirmado":
      return "bg-available/25 text-available border-available/90";
  }
}

function badgeLabel(kind: AgendamentoStatusKind) {
  switch (kind) {
    case "cancelado":
      return "Cancelado";
    case "faltou":
      return "Faltou";
    case "nao_confirmado":
      return "Não confirmado";
    case "concluido":
      return "Concluído";
    case "confirmado":
      return "Confirmado";
  }
}

type Props = {
  item: AgendamentoPainelItem;
  busy?: boolean;
  allowStatusChange?: boolean;
  menuActions?: AgendamentoStatusMenuAction[];
  onAction: (action: StatusAction) => void;
  onMenuAction?: (key: AgendamentoStatusMenuAction["key"]) => void;
};

export function AgendamentoStatusBadge({
  item,
  busy,
  allowStatusChange = true,
  menuActions,
  onAction,
  onMenuAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const kind = getStatusKind(item);
  const statusActions: StatusAction[] =
    allowStatusChange && kind !== "faltou"
      ? kind === "concluido"
        ? ["confirmar", "nao_confirmado"]
        : ACTIONS_BY_KIND[kind as Exclude<AgendamentoStatusKind, "faltou" | "concluido">]
      : [];
  const customActions = menuActions ?? [];
  const interactive = statusActions.length > 0 || customActions.length > 0;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative justify-self-start">
      <span
        className={cn(
          "inline-flex w-fit max-w-full items-center rounded-full border text-[11px] font-semibold whitespace-nowrap",
          interactive ? "pl-2 pr-0.5 py-0.5 gap-0.5" : "px-2 py-0.5",
          badgeToneClass(kind),
        )}
      >
        <span>{badgeLabel(kind)}</span>
        {interactive && (
          <button
            type="button"
            disabled={busy}
            aria-label="Alterar status"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className={cn(
              "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors",
              "hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50",
            )}
          >
            {busy ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", open && "rotate-180")} />
            )}
          </button>
        )}
      </span>
      {open && interactive && (
        <ul
          className="absolute left-0 top-full z-50 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-border/80 bg-popover py-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
          role="listbox"
        >
          {statusActions.map((action) => (
            <li key={action}>
              <button
                type="button"
                role="option"
                className="w-full px-3 py-1.5 text-left text-xs text-popover-foreground transition-colors hover:bg-secondary/60"
                onClick={() => {
                  setOpen(false);
                  onAction(action);
                }}
              >
                {ACTION_LABELS[action]}
              </button>
            </li>
          ))}
          {customActions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                role="option"
                className="w-full px-3 py-1.5 text-left text-xs text-popover-foreground transition-colors hover:bg-secondary/60"
                onClick={() => {
                  setOpen(false);
                  onMenuAction?.(action.key);
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
