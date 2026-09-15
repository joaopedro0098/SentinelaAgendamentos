import {
  LANDING_TRUST_ITEMS,
  type LandingTrustItem,
} from "@/features/landing/content/landingContent";
import { cn } from "@/lib/utils";
import { CreditCard, ShieldCheck } from "lucide-react";

type LandingTrustBadgesProps = {
  className?: string;
  items?: readonly LandingTrustItem[];
  /** Levemente maior — usado no hero. */
  size?: "default" | "comfortable";
};

function TrustBadgeIcon({
  icon,
  size,
}: {
  icon: LandingTrustItem["icon"];
  size: LandingTrustBadgesProps["size"];
}) {
  const className = cn(
    "shrink-0 text-primary",
    size === "comfortable" ? "h-[18px] w-[18px]" : "h-4 w-4",
  );

  if (icon === "credit-card") {
    return <CreditCard className={className} strokeWidth={1.75} aria-hidden />;
  }

  return <ShieldCheck className={className} aria-hidden />;
}

export function LandingTrustBadges({
  className,
  items = LANDING_TRUST_ITEMS,
  size = "default",
}: LandingTrustBadgesProps) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground",
        size === "comfortable" ? "text-[15px]" : "text-sm",
        className,
      )}
      aria-label="Garantias do teste grátis"
    >
      {items.map((item) => (
        <li
          key={item.id}
          className={cn("inline-flex items-center", size === "comfortable" ? "gap-2" : "gap-1.5")}
        >
          <TrustBadgeIcon icon={item.icon} size={size} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
