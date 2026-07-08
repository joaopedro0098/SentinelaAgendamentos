import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyDashboardThemeClass } from "@/hooks/useDashboardTheme";

const LANDING_PATHS = new Set([
  "/",
  "/planos",
  "/login",
  "/signup",
  "/signup/confirmar-codigo",
  "/recover",
  "/reset-password",
  "/reset-password/success",
  "/politica-de-privacidade",
  "/termos-de-servico",
]);

function resolveTheme(pathname: string): "landing" | "dashboard" | "booking" {
  if (LANDING_PATHS.has(pathname)) return "landing";
  if (pathname.startsWith("/app")) return "dashboard";
  if (pathname.startsWith("/agendar")) return "booking";
  return "landing";
}

/** Tema claro fixo em todo o app (off-white + verde sage). */
export function ThemeFromRoute() {
  const { pathname } = useLocation();

  useEffect(() => {
    const theme = resolveTheme(pathname);
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.remove("dark");
    root.classList.add("light");
    if (theme === "dashboard") {
      applyDashboardThemeClass("light");
    }
  }, [pathname]);

  return null;
}
