import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LandingSectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  /** Fundo alternado para ritmo visual entre seções */
  variant?: "default" | "muted" | "contrast";
  /** Largura máxima do conteúdo interno */
  narrow?: boolean;
};

const variantClasses = {
  default: "bg-background",
  muted: "bg-secondary/40",
  contrast: "bg-primary text-primary-foreground",
};

export function LandingSection({
  id,
  children,
  className,
  variant = "default",
  narrow = false,
}: LandingSectionProps) {
  return (
    <section id={id} className={cn("py-16 md:py-24", variantClasses[variant], className)}>
      <div className={cn("container", narrow && "max-w-4xl")}>{children}</div>
    </section>
  );
}
