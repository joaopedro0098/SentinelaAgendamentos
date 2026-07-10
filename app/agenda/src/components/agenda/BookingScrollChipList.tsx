import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ResponsivePagedStrip } from "@/components/agenda/ResponsivePagedStrip";

type Props = {
  children: ReactNode;
  /** Lista vertical com scroll próprio (painel Agendar, 3+ itens). */
  vertical?: boolean;
  className?: string;
  mobileClassName?: string;
  bleedClassName?: string;
  centerOn?: string | null;
};

const verticalListClass = cn(
  "flex flex-col gap-2",
  "max-h-[11.75rem] md:max-h-[10.25rem]",
  "overflow-y-auto overscroll-contain",
  "pr-1",
  "[scrollbar-width:thin]",
  "[&::-webkit-scrollbar]:w-1.5",
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/80",
  "[&>button]:w-full [&>button]:min-w-0 [&>button]:max-w-none",
);

export function BookingScrollChipList({
  children,
  vertical = false,
  className,
  mobileClassName,
  bleedClassName,
  centerOn,
}: Props) {
  if (vertical) {
    return <div className={verticalListClass}>{children}</div>;
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
