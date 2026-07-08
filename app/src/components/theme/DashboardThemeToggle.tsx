import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardTheme } from "@/hooks/useDashboardTheme";

export function DashboardThemeToggle() {
  const { mode, toggle } = useDashboardTheme();
  const isDark = mode === "dark";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold tracking-tight">Tema</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {isDark ? "Modo escuro — toque no sol para claro" : "Modo claro — toque na lua para escuro"}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={toggle}
        aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
        className="h-10 w-10 shrink-0"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  );
}
