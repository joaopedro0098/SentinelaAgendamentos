import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const LANDING_PATHS = new Set(["/", "/planos", "/login", "/politica-de-privacidade", "/termos-de-servico"]);

export function ThemeFromRoute() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.documentElement.dataset.theme = LANDING_PATHS.has(pathname) ? "landing" : "app";
  }, [pathname]);

  return null;
}
