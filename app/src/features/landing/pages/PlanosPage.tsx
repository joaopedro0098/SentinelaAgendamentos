import LandingFooter from "@/features/landing/components/LandingFooter";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Reveal } from "@/components/layout/PageReveal";
import { PLAN_TIERS } from "@/lib/planTiers";

const Planos = () => {
  return (
    <>
      <section className="pt-28 md:pt-36 pb-16 md:pb-24 flex-1">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Reveal index={0}>
              <h1 className="text-3xl md:text-5xl font-bold font-display text-foreground tracking-tight">
                Planos simples, <span className="text-primary">sem surpresas</span>
              </h1>
            </Reveal>
            <Reveal index={1}>
              <p className="mt-4 text-muted-foreground text-base md:text-lg">
                Teste grátis por 14 dias. Escolha o plano ideal para o seu consultório.
              </p>
            </Reveal>
          </div>

          <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            {PLAN_TIERS.map((tier, i) => (
              <Reveal key={tier.id} index={2 + i}>
                <div className="rounded-2xl border border-border bg-card p-6 md:p-8 flex flex-col h-full shadow-soft">
                  <div className="mb-6">
                    <p className="text-sm font-medium text-primary">{tier.name}</p>
                    <p className="mt-2 font-display text-3xl font-bold">{tier.priceShort}</p>
                    <p className="text-sm text-muted-foreground">/mês após o teste</p>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                        </span>
                        <span className="text-muted-foreground leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button asChild className="w-full rounded-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                    <Link to="/signup">Testar 14 dias grátis</Link>
                  </Button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <LandingFooter />
    </>
  );
};

export default Planos;
