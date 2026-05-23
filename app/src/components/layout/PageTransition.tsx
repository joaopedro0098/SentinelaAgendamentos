import { useEffect } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/**
 * Outlet de marketing — scroll ao topo; animação por blocos via PageReveal/Reveal.
 */
export function AnimatedMarketingOutlet({ className }: Props) {
  const location = useLocation();
  const outlet = useOutlet();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div key={location.pathname} className={cn("flex-1 flex flex-col", className)}>
      {outlet}
    </div>
  );
}
