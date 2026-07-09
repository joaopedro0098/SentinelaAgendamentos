import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/layout/PageReveal";
import { PLAN_TIERS } from "@/lib/planTiers";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { LandingTrustBadges } from "@/features/landing/components/LandingTrustBadges";
import { cn } from "@/lib/utils";

export function LandingPlansSection() {
  return (
    <LandingSection id="planos">
      <LandingSectionHeader
        eyebrow="Planos"
        title="Planos simples, sem surpresas"
        description="Teste grátis por 14 dias. Escolha o plano ideal e só pague se fizer sentido."
      />

      <Reveal index={0}>
        <LandingTrustBadges className="justify-center mb-10" />
      </Reveal>

      <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
        {PLAN_TIERS.map((tier, i) => {
          const isPro = tier.id === "pro";
          return (
            <Reveal key={tier.id} index={1 + i}>
              <article
                className={cn(
                  "relative rounded-2xl border bg-card p-6 md:p-8 flex flex-col h-full shadow-soft",
                  isPro ? "border-primary/40 ring-1 ring-primary/15" : "border-border/70",
                )}
              >
                {isPro ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Mais popular
                  </span>
                ) : null}

                <div className="mb-6">
                  <p className="text-sm font-medium text-primary">{tier.name}</p>
                  <p className="mt-2 font-display text-3xl md:text-4xl font-semibold tracking-tight">
                    {tier.priceShort}
                  </p>
                  <p className="text-sm text-muted-foreground">/mês após o teste grátis</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Check className="h-3 w-3 text-primary" strokeWidth={3} aria-hidden />
                      </span>
                      <span className="text-muted-foreground leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={cn(
                    "w-full rounded-full h-11 border-0",
                    isPro
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : "bg-secondary hover:bg-secondary/80 text-foreground",
                  )}
                >
                  <Link to="/signup">Testar 14 dias grátis</Link>
                </Button>
              </article>
            </Reveal>
          );
        })}
      </div>
    </LandingSection>
  );
}
