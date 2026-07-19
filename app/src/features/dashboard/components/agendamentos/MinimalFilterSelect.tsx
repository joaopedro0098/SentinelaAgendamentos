import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

export const AGENDAMENTOS_SIDEBAR_SECTION_LABEL =
  "mb-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground/80";

/** Altura máxima da lista = 5 opções (py-2 + text-sm); a partir da 6ª rola com scrollbar do tema. */
const FILTER_DROPDOWN_MAX_VISIBLE = 5;
const FILTER_DROPDOWN_LIST_MAX_HEIGHT = "max-h-[11.25rem]";

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
  /** Exibe o rótulo da opção selecionada em vez do label fixo (ex.: nome do profissional). */
  showSelectedLabel?: boolean;
  /** Classes extras no botão (ex.: card da sidebar de Agendamentos). */
  triggerClassName?: string;
  /** Rótulo fixo acima do campo (ex.: Profissionais, Serviços). */
  fieldLabel?: string;
  /** Sem seleção: mensagem informativa, texto cinza e dropdown desabilitado. */
  emptyState?: boolean;
};

export function MinimalFilterSelect({
  label,
  value,
  options,
  onChange,
  className,
  showSelectedLabel = false,
  triggerClassName,
  fieldLabel,
  emptyState = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = !emptyState && value !== "todos";
  const selectedLabel = options.find((opt) => opt.value === value)?.label;
  const displayLabel =
    emptyState && options[0]
      ? options[0].label
      : showSelectedLabel && selectedLabel
        ? selectedLabel
        : label;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const listScrollable = options.length > FILTER_DROPDOWN_MAX_VISIBLE;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {fieldLabel ? <p className={AGENDAMENTOS_SIDEBAR_SECTION_LABEL}>{fieldLabel}</p> : null}
      <button
        type="button"
        disabled={emptyState}
        onClick={() => {
          if (emptyState) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
          emptyState ? "cursor-default opacity-100" : "hover:bg-secondary/40",
          triggerClassName ?? "border-border/70 bg-card/60",
          isActive && "border-accent/40 bg-accent/5",
        )}
        aria-expanded={emptyState ? undefined : open}
        aria-disabled={emptyState}
        aria-label={
          emptyState ? displayLabel : `Filtrar por ${label.toLowerCase()}`
        }
      >
        <span
          className={cn(
            "font-medium",
            emptyState || !isActive
              ? "text-muted-foreground"
              : showSelectedLabel
                ? "text-foreground"
                : "text-muted-foreground",
          )}
        >
          {displayLabel}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            emptyState && "opacity-40",
            open && !emptyState && "rotate-180",
          )}
        />
      </button>
      {open && !emptyState && (
        <ul
          className={cn(
            "absolute z-40 mt-1 w-full rounded-xl border border-border/80 bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-150",
            listScrollable
              ? cn(FILTER_DROPDOWN_LIST_MAX_HEIGHT, "overflow-y-auto overscroll-contain")
              : "overflow-hidden",
          )}
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
