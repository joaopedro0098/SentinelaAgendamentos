import { useEffect, useState } from "react";

export type DashboardThemeMode = "light" | "dark";

const STORAGE_KEY = "sentinela-dashboard-theme";

function readStored(): DashboardThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "light";
}

export function applyDashboardThemeClass(mode: DashboardThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("light", mode === "light");
  root.classList.toggle("dark", mode === "dark");
}

export function useDashboardTheme() {
  const [mode] = useState<DashboardThemeMode>(readStored);

  useEffect(() => {
    if (document.documentElement.dataset.theme === "dashboard") {
      applyDashboardThemeClass(mode);
    }
  }, [mode]);

  return { mode };
}
