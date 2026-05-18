import type { ReactNode } from "react";
import "../../../agenda/src/index.css";

/** Envolve as telas da pasta `agenda/` com o CSS dela, sem alterar os arquivos originais. */
export function AgendaShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-background text-foreground">
      {children}
    </div>
  );
}

