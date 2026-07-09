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
    <div className="container py-12 md:py-16">
      <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
        <div className="sm:col-span-2 space-y-4">
          <BrandLogo linkTo="/" showName showFullName size="md" />
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            Gestão de agenda e consultório para profissionais de saúde e bem-estar. Simples, confiável e com suporte
            humanizado.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground mb-3">Produto</p>
          <ul className="space-y-2">
            <li>
              <FooterLink to="/#funcionalidades">Funcionalidades</FooterLink>
            </li>
            <li>
              <FooterLink to="/planos">Planos e preços</FooterLink>
            </li>
            <li>
              <FooterLink to="/#faq">Dúvidas frequentes</FooterLink>
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
              <FooterLink to="/termos-de-servico">Termos de serviço</FooterLink>
            </li>
          </ul>
        </div>
      </div>

      <p className="mt-10 pt-6 border-t border-border/50 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sentinela Agendamentos — sentinelagendamentos.com
      </p>
    </div>
  </footer>
);

export default LandingFooter;
