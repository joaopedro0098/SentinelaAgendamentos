import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardTheme } from "@/hooks/useDashboardTheme";

export function DashboardThemeToggle({ className }: { className?: string }) {
  const { mode, toggle } = useDashboardTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("h-9 w-9 shrink-0 rounded-full", className)}
      onClick={toggle}
      aria-label={mode === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
