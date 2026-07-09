import { Children, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const STAGGER_MS = 70;

type RevealProps = {
  children: ReactNode;
  index?: number;
  className?: string;
};

/** Bloco individual que sobe levemente ao entrar na página. */
export function Reveal({ children, index = 0, className }: RevealProps) {
  const { pathname } = useLocation();

  return (
    <div
      key={`${pathname}-${index}`}
      className={cn("animate-reveal-up motion-reduce:animate-none", className)}
      style={{ animationDelay: `${index * STAGGER_MS}ms` }}
    >
      {children}
    </div>
  );
}

type PageRevealProps = {
  children: ReactNode;
  className?: string;
};

/** Agrupa filhos diretos e aplica entrada escalonada (por partes). */
export function PageReveal({ children, className }: PageRevealProps) {
  const items = Children.toArray(children).filter(Boolean);

  return (
    <div className={className}>
      {items.map((child, i) => (
        <Reveal key={i} index={i}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}
