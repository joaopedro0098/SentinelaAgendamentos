import { Reveal } from "@/components/layout/PageReveal";
import { HOW_IT_WORKS_STEPS } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";

export function HowItWorksSection() {
  return (
    <LandingSection id="como-funciona" variant="contrast">
      <header className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
        <p className="landing-eyebrow mb-3 text-primary-foreground/75">Como funciona</p>
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-balance text-primary-foreground sm:text-3xl md:text-4xl">
          Sua agenda online em três passos
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-balance text-primary-foreground/85 sm:text-base md:text-lg">
          Do cadastro ao primeiro agendamento em poucos minutos.
        </p>
      </header>

      <ol className="mx-auto grid max-w-4xl list-none gap-6 md:grid-cols-3 md:gap-8">
        {HOW_IT_WORKS_STEPS.map((item, i) => (
          <Reveal key={item.step} index={i}>
            <li className="relative text-center md:text-left">
              {i < HOW_IT_WORKS_STEPS.length - 1 ? (
                <span
                  className="absolute top-6 right-0 hidden h-px bg-primary-foreground/25 md:block md:left-[calc(50%+2rem)]"
                  aria-hidden
                />
              ) : null}
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground font-display text-lg font-semibold text-primary">
                {item.step}
              </div>
              <h3 className="font-display text-lg font-semibold text-primary-foreground">{item.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-primary-foreground/85 md:mx-0">
                {item.description}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>
    </LandingSection>
  );
}
