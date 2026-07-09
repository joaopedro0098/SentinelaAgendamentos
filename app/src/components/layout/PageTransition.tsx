import { useEffect } from "react";
import { useLocation, useOutlet } from "react-router-dom";

/** Outlet de marketing — scroll ao topo; entrada suave por página. */
export function AnimatedMarketingOutlet() {
  const location = useLocation();
  const outlet = useOutlet();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div
      key={location.pathname}
      className="flex-1 flex flex-col animate-reveal-up motion-reduce:animate-none"
    >
      {outlet}
    </div>
  );
}
