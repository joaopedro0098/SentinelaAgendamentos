import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "../../../agenda/src/index.css";

type AgendaShellProps = {
  children: ReactNode;
  /** Painel do barbeiro: segue claro/escuro do dashboard. Link público: booking claro fixo. */
  variant?: "booking" | "dashboard";
};

export function AgendaShell({ children, variant = "booking" }: AgendaShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen w-full max-w-[100vw] overflow-x-hidden",
        variant === "booking" && "booking-surface",
        variant === "dashboard" && "min-h-full bg-background",
      )}
    >
      {children}
    </div>
  );
}

