import { useCallback, useEffect, useState } from "react";

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
  const [mode, setModeState] = useState<DashboardThemeMode>(readStored);

  const setMode = useCallback((next: DashboardThemeMode) => {
    setModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    if (document.documentElement.dataset.theme === "dashboard") {
      applyDashboardThemeClass(next);
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  useEffect(() => {
    if (document.documentElement.dataset.theme === "dashboard") {
      applyDashboardThemeClass(mode);
    }
  }, [mode]);

  return { mode, setMode, toggle };
}
