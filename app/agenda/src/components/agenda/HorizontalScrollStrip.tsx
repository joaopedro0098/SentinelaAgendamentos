import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const STRIP_CLASS =
  "flex gap-2 overflow-x-auto snap-x snap-mandatory py-2 overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

type Props = {
  children: ReactNode;
  className?: string;
  /** Ex.: `[data-slot="09:00"]` — mantém o item visível ao selecionar */
  centerOn?: string | null;
};

export function HorizontalScrollStrip({ children, className, centerOn }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!centerOn || !ref.current) return;
    ref.current.querySelector<HTMLElement>(centerOn)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [centerOn]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div ref={ref} className={cn(STRIP_CLASS, "w-full max-w-full", className)}>
        {children}
      </div>
    </div>
  );
}

