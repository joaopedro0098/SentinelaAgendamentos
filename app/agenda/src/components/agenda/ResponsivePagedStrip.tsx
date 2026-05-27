import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HorizontalScrollStrip } from "@/components/agenda/HorizontalScrollStrip";

type Props = {
  children: ReactNode;
  className?: string;
  mobileClassName?: string;
  bleedClassName?: string;
  centerOn?: string | null;
};

export function ResponsivePagedStrip({
  children,
  className,
  mobileClassName,
  bleedClassName,
  centerOn,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 2;
    setCanPrev(overflow && el.scrollLeft > 2);
    setCanNext(overflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    updateArrows();
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [updateArrows, children]);

  useEffect(() => {
    if (!centerOn || !viewportRef.current) return;
    viewportRef.current.querySelector<HTMLElement>(centerOn)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [centerOn]);

  const scrollPage = (dir: -1 | 1) => {
    const el = viewportRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.75, 140);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <>
      <div className={cn("md:hidden", bleedClassName)}>
        <HorizontalScrollStrip centerOn={centerOn} className={mobileClassName}>
          {children}
        </HorizontalScrollStrip>
      </div>

      <div className="hidden md:flex items-center gap-2 min-w-0">
        {canPrev ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 h-9 w-9 rounded-full"
            onClick={() => scrollPage(-1)}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        ) : null}

        <div
          ref={viewportRef}
          className={cn(
            "flex-1 min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            className,
          )}
        >
          <div className="flex gap-2 py-1 w-max">{children}</div>
        </div>

        {canNext ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 h-9 w-9 rounded-full"
            onClick={() => scrollPage(1)}
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </>
  );
}
