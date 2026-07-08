import { useEffect } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/** Outlet de marketing — scroll ao topo; entrada suave por página. */
export function AnimatedMarketingOutlet({ className }: Props) {
  const location = useLocation();
  const outlet = useOutlet();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div
      key={location.pathname}
      className={cn("flex-1 flex flex-col animate-reveal-up motion-reduce:animate-none", className)}
    >
      {outlet}
    </div>
  );
}
