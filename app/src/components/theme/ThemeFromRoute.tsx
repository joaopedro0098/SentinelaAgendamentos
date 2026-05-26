import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyDashboardThemeClass, type DashboardThemeMode } from "@/hooks/useDashboardTheme";

const LANDING_PATHS = new Set([
  "/",
  "/planos",
  "/login",
  "/signup",
  "/signup/verify-email",
  "/recover",
  "/reset-password",
  "/politica-de-privacidade",
  "/termos-de-servico",
]);

const STORAGE_KEY = "sentinela-dashboard-theme";

function readDashboardMode(): DashboardThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "light";
}

function resolveTheme(pathname: string): "landing" | "dashboard" | "booking" {
  if (LANDING_PATHS.has(pathname)) return "landing";
  if (pathname.startsWith("/app")) return "dashboard";
  if (pathname.startsWith("/agendar")) return "booking";
  return "landing";
}

export function ThemeFromRoute() {
  const { pathname } = useLocation();

  useEffect(() => {
    const theme = resolveTheme(pathname);
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.remove("light", "dark");
    if (theme === "dashboard") {
      applyDashboardThemeClass(readDashboardMode());
    }
  }, [pathname]);

  return null;
}
