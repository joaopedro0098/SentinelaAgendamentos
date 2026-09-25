import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ResponsivePagedStrip } from "@/components/agenda/ResponsivePagedStrip";

type Props = {
  children: ReactNode;
  /** Lista vertical com scroll próprio (3+ itens). */
  vertical?: boolean;
  /** Com `vertical`, rolagem só acima deste número de itens visíveis (padrão 3). */
  verticalScrollAfter?: number;
  verticalItemCount?: number;
  className?: string;
  mobileClassName?: string;
  bleedClassName?: string;
  centerOn?: string | null;
};

/** 3 chips: min-h-14 (3.5rem) + gap-2 (0.5rem) entre linhas */
const VERTICAL_SCROLL_MAX_H = "max-h-[11.5rem]";

function verticalListClass(scrollWhenAbove: number, itemCount: number) {
  const needsScroll = itemCount > scrollWhenAbove;
  return cn(
    "flex flex-col gap-2",
    needsScroll && VERTICAL_SCROLL_MAX_H,
    needsScroll && "overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]",
    needsScroll &&
      "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/80",
    "[&>button]:w-full [&>button]:min-w-0 [&>button]:max-w-none",
  );
}

export function BookingScrollChipList({
  children,
  vertical = false,
  verticalScrollAfter = 3,
  verticalItemCount = 0,
  className,
  mobileClassName,
  bleedClassName,
  centerOn,
}: Props) {
  if (vertical) {
    return (
      <div className={verticalListClass(verticalScrollAfter, verticalItemCount)}>{children}</div>
    );
  }

  return (
    <ResponsivePagedStrip
      className={className}
      mobileClassName={mobileClassName}
      bleedClassName={bleedClassName}
      centerOn={centerOn}
    >
      {children}
    </ResponsivePagedStrip>
  );
}
