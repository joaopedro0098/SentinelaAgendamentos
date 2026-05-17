import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardTheme } from "@/hooks/useDashboardTheme";

export function DashboardThemeToggle({ className }: { className?: string }) {
  const { mode, toggle } = useDashboardTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={toggle}
      aria-label={mode === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline">{mode === "dark" ? "Claro" : "Escuro"}</span>
    </Button>
  );
}
