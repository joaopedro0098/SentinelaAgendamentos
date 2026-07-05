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

/** Velocidade do acompanhamento suave durante o scroll (mobile). */
const SCROLL_FOLLOW_FACTOR = 0.2;
/** Deslocamento vertical máximo do menu durante o scroll (mobile). */
const MAX_SCROLL_OFFSET = 18;

type ScrollAnchor = {
  style: MenuStyle;
};

function clampVerticalOffset(delta: number) {
  return Math.max(-MAX_SCROLL_OFFSET, Math.min(MAX_SCROLL_OFFSET, delta));
}

function applyScrollOffsetCap(anchor: MenuStyle, trueStyle: MenuStyle): MenuStyle {
  const anchorTop = anchor.top ?? 0;
  const trueTop = trueStyle.top ?? anchorTop;
  const offsetY = clampVerticalOffset(trueTop - anchorTop);

  return {
    top: anchor.top !== undefined ? anchorTop + offsetY : trueStyle.top,
    bottom: anchor.bottom !== undefined ? anchor.bottom - offsetY : trueStyle.bottom,
    left: trueStyle.left,
  };
}

function smoothToward(current: number, target: number) {
  const delta = target - current;
  if (Math.abs(delta) < 0.5) return target;
  return current + delta * SCROLL_FOLLOW_FACTOR;
}

function stylesMatch(a: MenuStyle, b: MenuStyle) {
  return (
    Math.abs((a.top ?? 0) - (b.top ?? 0)) < 0.5 &&
    Math.abs((a.bottom ?? 0) - (b.bottom ?? 0)) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5
  );
}

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
  const scrollAnchorRef = useRef<ScrollAnchor | null>(null);
  const targetStyleRef = useRef<MenuStyle | null>(null);
  const displayStyleRef = useRef<MenuStyle | null>(null);
  const rafLoopRef = useRef<number | null>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useScrollLag = compact && alignBottomToCard;

  const canRenderMenu = hasMenuChildren(children);

  const cancelScrollLoop = () => {
    if (rafLoopRef.current !== null) {
      cancelAnimationFrame(rafLoopRef.current);
      rafLoopRef.current = null;
    }
  };

  const applyStyle = (style: MenuStyle) => {
    displayStyleRef.current = style;
    setMenuStyle(style);
  };

  const computeTargetStyle = (): MenuStyle | null => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const menuWidth = compact ? 132 : 176;

    if (alignBottomToCard) {
      const cardRect = buttonRef.current
        ?.closest("[data-agendamento-card]")
        ?.getBoundingClientRect();
      if (cardRect) {
        return {
          top: rect.bottom + 2,
          bottom: window.innerHeight - cardRect.bottom,
          left: Math.max(cardRect.left + 8, cardRect.right - menuWidth - 8),
        };
      }
    }

    const menuHeight = menuRef.current?.offsetHeight ?? (compact ? 120 : 160);
    const gap = 4;
    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - gap);
    }
    return {
      top,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    };
  };

  const clearScrollEndTimer = () => {
    if (scrollEndTimerRef.current !== null) {
      clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = null;
    }
  };

  const runScrollLoop = () => {
    const target = targetStyleRef.current;
    const prev = displayStyleRef.current;
    if (!target || !prev) {
      rafLoopRef.current = null;
      return;
    }

    if (stylesMatch(prev, target)) {
      rafLoopRef.current = null;
      return;
    }

    const next: MenuStyle = {
      top:
        prev.top !== undefined && target.top !== undefined
          ? smoothToward(prev.top, target.top)
          : target.top,
      bottom:
        prev.bottom !== undefined && target.bottom !== undefined
          ? smoothToward(prev.bottom, target.bottom)
          : target.bottom,
      left: smoothToward(prev.left, target.left),
    };

    const settled = stylesMatch(next, target);
    applyStyle(settled ? target : next);

    if (settled) {
      rafLoopRef.current = null;
      return;
    }

    rafLoopRef.current = requestAnimationFrame(runScrollLoop);
  };

  const scheduleScrollLoop = () => {
    if (rafLoopRef.current === null) {
      rafLoopRef.current = requestAnimationFrame(runScrollLoop);
    }
  };

  const updatePosition = (resetAnchor = false) => {
    const trueStyle = computeTargetStyle();
    if (!trueStyle) return;

    if (!useScrollLag || resetAnchor) {
      if (useScrollLag) {
        scrollAnchorRef.current = { style: trueStyle };
      }
      cancelScrollLoop();
      applyStyle(trueStyle);
      return;
    }

    const anchor = scrollAnchorRef.current;
    if (!anchor) {
      scrollAnchorRef.current = { style: trueStyle };
      applyStyle(trueStyle);
      return;
    }

    targetStyleRef.current = applyScrollOffsetCap(anchor.style, trueStyle);
    scheduleScrollLoop();
  };

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuStyle(null);
      scrollAnchorRef.current = null;
      targetStyleRef.current = null;
      displayStyleRef.current = null;
      cancelScrollLoop();
      clearScrollEndTimer();
      return;
    }

    const onResize = () => updatePosition(true);
    const onScroll = () => {
      updatePosition(false);
      clearScrollEndTimer();
      scrollEndTimerRef.current = setTimeout(() => {
        scrollEndTimerRef.current = null;
        updatePosition(true);
      }, 80);
    };

    updatePosition(true);
    const raf = requestAnimationFrame(() => updatePosition(true));
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(raf);
      cancelScrollLoop();
      clearScrollEndTimer();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
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
