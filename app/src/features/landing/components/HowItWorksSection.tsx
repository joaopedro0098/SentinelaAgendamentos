import { Reveal } from "@/components/layout/PageReveal";
import { HOW_IT_WORKS_STEPS } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingSectionHeader } from "@/features/landing/components/LandingSectionHeader";

export function HowItWorksSection() {
  return (
    <LandingSection id="como-funciona" variant="muted">
      <LandingSectionHeader
        eyebrow="Como funciona"
        title="Sua agenda online em três passos"
        description="Do cadastro ao primeiro agendamento em menos de um dia — sem instalar nada no computador."
        align="center"
      />

      <ol className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-4xl mx-auto list-none">
        {HOW_IT_WORKS_STEPS.map((item, i) => (
          <Reveal key={item.step} index={i}>
            <li className="relative text-center md:text-left">
              {i < HOW_IT_WORKS_STEPS.length - 1 ? (
                <span
                  className="hidden md:block absolute top-6 left-[calc(50%+2rem)] right-0 h-px bg-border"
                  aria-hidden
                />
              ) : null}
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-display text-lg font-semibold mb-4">
                {item.step}
              </div>
              <h3 className="font-display text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto md:mx-0">
                {item.description}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>
    </LandingSection>
  );
}
