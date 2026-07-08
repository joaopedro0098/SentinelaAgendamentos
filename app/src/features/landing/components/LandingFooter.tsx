import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";

const FooterLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
    {children}
  </Link>
);

const LandingFooter = () => (
  <footer className="border-t border-border/60 bg-background">
    <div className="container py-12 md:py-14">
      <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <BrandLogo linkTo="/" showName showFullName size="md" />
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            Humanizando a tecnologia para profissionais da área da saúde e bem estar.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Produto</p>
          <ul className="space-y-2">
            <li>
              <FooterLink to="/planos">Preços</FooterLink>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Legal</p>
          <ul className="space-y-2">
            <li>
              <FooterLink to="/politica-de-privacidade">Privacidade</FooterLink>
            </li>
            <li>
              <FooterLink to="/termos-de-servico">Termos</FooterLink>
            </li>
          </ul>
        </div>
      </div>

      <p className="mt-10 pt-6 border-t border-border/50 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sentinela Agendamentos
      </p>
    </div>
  </footer>
);

export default LandingFooter;
