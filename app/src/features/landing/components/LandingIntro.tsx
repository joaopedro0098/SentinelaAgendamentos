import type { ReactNode } from "react";

/** Fundo esfumaçado do topo da landing (hero + vídeo), com fade suave antes da próxima seção. */
export function LandingIntro({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-16 left-[15%] h-80 w-80 rounded-full bg-[hsl(var(--brand-green)/0.18)] blur-3xl animate-pulse-glow md:top-20 md:left-1/4 md:h-96 md:w-96" />
        <div className="absolute top-28 right-[10%] h-80 w-80 rounded-full bg-[hsl(var(--brand-mint)/0.2)] blur-3xl md:top-36 md:right-1/4 md:h-96 md:w-96" />
        <div className="absolute left-1/2 top-[38%] h-[420px] w-[min(100%,56rem)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,hsl(var(--brand-green)/0.1)_0%,transparent_68%)] md:top-[42%]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent via-background/70 to-background md:h-64" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
