import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LandingPrimaryCtaProps = {
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
  /** Estilo para seções com fundo escuro */
  inverted?: boolean;
};

export function LandingPrimaryCta({
  primaryLabel = "Começar teste grátis",
  primaryHref = "/signup",
  secondaryLabel,
  secondaryHref,
  className,
  inverted = false,
}: LandingPrimaryCtaProps) {
  const primaryClass = inverted
    ? "h-12 rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90 border-0 px-8 text-base font-medium shadow-elevated"
    : "h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 px-8 text-base font-medium";

  const secondaryClass = inverted
    ? "h-12 rounded-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 px-8 text-base font-medium"
    : "h-12 rounded-full border-border bg-background hover:bg-secondary/60 px-8 text-base font-medium text-foreground";

  return (
    <div className={cn("flex flex-col sm:flex-row gap-3", className)}>
      <Button asChild className={cn(primaryClass, "w-full sm:w-auto")}>
        <Link to={primaryHref}>{primaryLabel}</Link>
      </Button>
      {secondaryLabel && secondaryHref ? (
        <Button asChild variant="outline" className={cn(secondaryClass, "w-full sm:w-auto")}>
          <a href={secondaryHref}>{secondaryLabel}</a>
        </Button>
      ) : null}
    </div>
  );
}
