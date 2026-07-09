import { Calendar, Users, UsersRound, BarChart2, CreditCard, Bell } from "lucide-react";
import { Reveal } from "@/components/layout/PageReveal";
import { SOLUTION_FEATURES } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";

const FEATURE_ICONS = {
  agendamento: Calendar,
  pacientes: Users,
  equipe: UsersRound,
  relatorios: BarChart2,
  pagamento: CreditCard,
  lembretes: Bell,
} as const;

export function FeaturesShowcase() {
  return (
    <LandingSection id="funcionalidades">
      <LandingSectionHeader
        eyebrow="A solução"
        title="Tudo que seu consultório precisa, sem complicação"
        description="Um painel claro para quem atende pacientes — não um sistema genérico que exige treinamento."
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-5xl mx-auto">
        {SOLUTION_FEATURES.map((feature, i) => {
          const Icon = FEATURE_ICONS[feature.id as keyof typeof FEATURE_ICONS];
          return (
            <Reveal key={feature.id} index={i}>
              <article className="h-full rounded-2xl border border-border/60 bg-card p-5 md:p-6 shadow-soft hover:border-primary/25 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="font-display text-base font-semibold text-foreground leading-snug">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </article>
            </Reveal>
          );
        })}
      </div>

      <Reveal index={6}>
        <LandingPrimaryCta className="mt-10 justify-center" />
      </Reveal>
    </LandingSection>
  );
}
