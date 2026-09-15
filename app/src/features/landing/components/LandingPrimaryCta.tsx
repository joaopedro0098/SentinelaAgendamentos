import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LANDING_HERO } from "@/features/landing/content/landingContent";
import { cn } from "@/lib/utils";

type LandingPrimaryCtaProps = {
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
};

export function LandingPrimaryCta({
  primaryLabel = LANDING_HERO.ctaPrimary,
  primaryHref = "/signup",
  secondaryLabel,
  secondaryHref,
  className,
}: LandingPrimaryCtaProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row gap-3", className)}>
      <Button
        asChild
        className="h-12 w-full rounded-lg border-0 bg-primary px-8 text-base font-medium text-primary-foreground hover:bg-primary/90 sm:w-auto"
      >
        <Link to={primaryHref}>{primaryLabel}</Link>
      </Button>
      {secondaryLabel && secondaryHref ? (
        <Button
          asChild
          variant="outline"
          className="h-12 w-full rounded-full border-border bg-background px-8 text-base font-medium text-foreground hover:bg-secondary/60 sm:w-auto"
        >
          <a href={secondaryHref}>{secondaryLabel}</a>
        </Button>
      ) : null}
    </div>
  );
}
