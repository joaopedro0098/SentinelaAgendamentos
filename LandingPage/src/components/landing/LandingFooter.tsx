import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const LegalLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link
    to={to}
    className="text-muted-foreground/90 hover:text-foreground/90 transition-colors text-xs sm:text-sm underline-offset-4 hover:underline"
  >
    {children}
  </Link>
);

const LandingFooter = () => (
  <footer className="border-t border-border/40 bg-background/40 backdrop-blur-sm">
    <div className="container py-8 flex flex-col items-center justify-center gap-5 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <LegalLink to="/termos-de-servico">Termos de serviço</LegalLink>
        <span className="text-muted-foreground/40 select-none text-xs" aria-hidden>
          ·
        </span>
        <LegalLink to="/politica-de-privacidade">Política de privacidade</LegalLink>
      </div>
      <p className="text-muted-foreground/70 text-xs">© {new Date().getFullYear()} Sentinela Agendamentos</p>
    </div>
  </footer>
);

export default LandingFooter;
