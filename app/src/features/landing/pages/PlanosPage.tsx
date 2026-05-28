import LandingFooter from "@/features/landing/components/LandingFooter";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageReveal } from "@/components/layout/PageReveal";
import { PLAN_FEATURES, PLAN_PRICE_DISPLAY, PLAN_PRICE_LABEL } from "@/lib/planPricing";

const Planos = () => {
  return (
    <>
      <section className="pt-36 pb-24 relative flex-1">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--brand-green)/0.14),transparent_60%)]" />
        <div className="container relative">
          <PageReveal>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h1 className="text-4xl md:text-5xl font-bold font-display text-foreground">
                Um plano, <span className="text-gradient">tudo incluso</span>
              </h1>
              <p className="mt-4 text-muted-foreground">
                Teste grátis por 14 dias. Depois, {PLAN_PRICE_LABEL} para continuar agendando sem limites.
              </p>
            </div>

            <div className="max-w-md mx-auto">
              <div className="relative rounded-3xl p-8 flex flex-col glass glow-border shadow-glow">
                <div className="text-center mb-8">
                  <h2 className="text-3xl md:text-4xl font-bold font-display leading-tight text-gradient">
                    Teste 14 dias grátis
                  </h2>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {PLAN_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 bg-gradient-brand">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="text-center mb-6">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <span className="text-5xl font-bold font-display mx-1">{PLAN_PRICE_DISPLAY}</span>
                  <span className="text-sm text-muted-foreground">/mês</span>
                </div>

                <Button
                  asChild
                  size="lg"
                  className="w-full rounded-full h-12 bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
                >
                  <Link to="/signup">
                    Começar teste grátis <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </PageReveal>
        </div>
      </section>
      <PageReveal startIndex={2}>
        <LandingFooter />
      </PageReveal>
    </>
  );
};

export default Planos;
