import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyDashboardThemeClass, getDashboardThemeMode } from "@/hooks/useDashboardTheme";

const LANDING_PATHS = new Set([
  "/",
  "/planos",
  "/login",
  "/signup",
  "/signup/confirmar-codigo",
  "/verificacao-facial",
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

/** Landing e booking sempre claros; painel (/app) respeita preferência salva. */
export function ThemeFromRoute() {
  const { pathname } = useLocation();

  useEffect(() => {
    const theme = resolveTheme(pathname);
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (theme === "dashboard") {
      applyDashboardThemeClass(getDashboardThemeMode());
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
  }, [pathname]);

  return null;
}
