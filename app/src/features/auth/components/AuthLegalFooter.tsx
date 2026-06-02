import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const LegalLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link
    to={to}
    className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
  >
    {children}
  </Link>
);

export function AuthLegalFooter() {
  return (
    <footer className="border-t border-border/40 bg-background/60 backdrop-blur-sm mt-auto">
      <div className="container py-6 flex flex-col items-center gap-3 text-center text-xs text-muted-foreground">
        <p>
          <strong className="font-medium text-foreground">Sentinela Agendamentos</strong> — plataforma de agendamento
          online para barbearias
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <LegalLink to="/termos-de-servico">Termos de serviço</LegalLink>
          <span className="text-muted-foreground/40 select-none" aria-hidden>
            ·
          </span>
          <LegalLink to="/politica-de-privacidade">Política de privacidade</LegalLink>
        </div>
        <p className="text-muted-foreground/70">© {new Date().getFullYear()} sentinelagendamentos.com</p>
      </div>
    </footer>
  );
}
