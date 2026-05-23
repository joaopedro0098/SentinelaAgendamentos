import { useEffect, useRef, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const EXIT_MS = 120;

type Props = {
  className?: string;
};

/**
 * Transição suave entre páginas de marketing (landing, planos, login…).
 * Mesmo comportamento no celular e no desktop.
 */
export function AnimatedMarketingOutlet({ className }: Props) {
  const location = useLocation();
  const currentOutlet = useOutlet();
  const [visible, setVisible] = useState(true);
  const [renderedOutlet, setRenderedOutlet] = useState(currentOutlet);
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === pathRef.current) {
      setRenderedOutlet(currentOutlet);
      return;
    }

    setVisible(false);
    const timer = window.setTimeout(() => {
      pathRef.current = location.pathname;
      setRenderedOutlet(currentOutlet);
      window.requestAnimationFrame(() => setVisible(true));
    }, EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [location.pathname, currentOutlet]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div
      className={cn(
        "flex-1 flex flex-col transition-all duration-300 ease-out motion-reduce:transition-none",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1.5",
        className,
      )}
    >
      {renderedOutlet}
    </div>
  );
}
