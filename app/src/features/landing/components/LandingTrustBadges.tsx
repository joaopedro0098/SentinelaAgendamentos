import { LANDING_TRUST_ITEMS } from "@/features/landing/content/landingContent";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

type LandingTrustBadgesProps = {
  className?: string;
  inverted?: boolean;
};

export function LandingTrustBadges({ className, inverted = false }: LandingTrustBadgesProps) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-sm",
        inverted ? "text-primary-foreground/85" : "text-muted-foreground",
        className,
      )}
      aria-label="Garantias do teste grátis"
    >
      {LANDING_TRUST_ITEMS.map((item) => (
        <li key={item} className="inline-flex items-center gap-1.5">
          <ShieldCheck
            className={cn("h-4 w-4 shrink-0", inverted ? "text-primary-foreground/70" : "text-primary")}
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
