import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type MenuStyle = {
  top?: number;
  left: number;
  bottom?: number;
};

type Props = {
  children: ReactNode;
  disabled?: boolean;
  /** Layout mobile: itens distribuídos na altura do card. */
  compact?: boolean;
  /** Ancora a borda inferior do menu à borda inferior do card pai. */
  alignBottomToCard?: boolean;
};

function hasMenuChildren(children: ReactNode) {
  return Children.toArray(children).some((child) => isValidElement(child));
}

const CompactMenuContext = createContext(false);

export function AgendamentoActionsMenu({
  children,
  disabled,
  compact = false,
  alignBottomToCard = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);

  const canRenderMenu = hasMenuChildren(children);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuStyle(null);
      return;
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = compact ? 132 : 176;

      if (alignBottomToCard) {
        const cardRect = buttonRef.current
          ?.closest("[data-agendamento-card]")
          ?.getBoundingClientRect();
        if (cardRect) {
          setMenuStyle({
            top: rect.bottom + 2,
            bottom: window.innerHeight - cardRect.bottom,
            left: Math.max(cardRect.left + 8, cardRect.right - menuWidth - 8),
          });
          return;
        }
      }

      const menuHeight = menuRef.current?.offsetHeight ?? (compact ? 120 : 160);
      const gap = 4;
      let top = rect.bottom + gap;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - gap);
      }
      setMenuStyle({
        top,
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      });
    };

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, compact, alignBottomToCard]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!canRenderMenu) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label="Ações do agendamento"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <CompactMenuContext.Provider value={compact}>
              <div
                ref={menuRef}
                className={cn(
                  "fixed z-[200] rounded-xl border border-border/80 bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-150",
                  compact
                    ? "flex w-[8.25rem] flex-col p-1"
                    : "min-w-[11rem] p-1",
                )}
                style={{
                  top: menuStyle.top,
                  bottom: menuStyle.bottom,
                  left: menuStyle.left,
                }}
                onClick={() => setOpen(false)}
              >
                {children}
              </div>
            </CompactMenuContext.Provider>,
            document.body,
          )
        : null}
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
  const compact = useContext(CompactMenuContext);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-lg text-left transition-colors disabled:opacity-50",
        compact ? "min-h-0 flex-1 px-3 text-sm" : "px-3 py-2 text-sm",
        destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-secondary/60",
      )}
    >
      {label}
    </button>
  );
}

export function AgendamentoMenuActionLoading({ compact: compactProp }: { compact?: boolean }) {
  const compactFromContext = useContext(CompactMenuContext);
  const compact = compactProp ?? compactFromContext;
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-muted-foreground",
        compact ? "min-h-0 flex-1 justify-center px-3 text-sm" : "px-3 py-2 text-sm",
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Processando…
    </div>
  );
}
