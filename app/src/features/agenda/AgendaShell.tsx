import type { ReactNode } from "react";
import "../../../agenda/src/index.css";

/** Envolve booking com tema claro fixo, isolado do claro/escuro do painel. */
export function AgendaShell({ children }: { children: ReactNode }) {
  return (
    <div className="booking-surface min-h-screen w-full max-w-[100vw] overflow-x-hidden">
      {children}
    </div>
  );
}

