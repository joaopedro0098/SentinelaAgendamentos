import { Reveal } from "@/components/layout/PageReveal";
import { QUER_MAIS_CTA } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";
import { useLandingPageContent } from "@/features/landing/context/LandingPageContentContext";

export function QuerMaisCtaSection() {
  const { primarySignupHref, hero } = useLandingPageContent();

  return (
    <LandingSection id="funcionalidades-chamada" className="min-h-[100svh] py-0 md:py-0">
      <Reveal index={0}>
        <div className="mx-auto flex min-h-[100svh] w-full max-w-xl flex-col px-4 sm:px-6">
          <div className="flex flex-1 flex-col justify-center text-center">
            <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-balance text-foreground sm:text-3xl md:text-4xl">
              {QUER_MAIS_CTA.headline}
            </h2>
            <LandingPrimaryCta
              className="mt-5 justify-center sm:mt-6"
              primaryHref={primarySignupHref}
              primaryLabel={hero.ctaPrimary}
            />
          </div>

          <div
            id="landing-wa-fab-anchor"
            className="flex min-h-[30svh] w-full shrink-0 items-end justify-center pb-8 sm:min-h-[32svh] sm:pb-10 md:pb-12"
            aria-hidden
          />
        </div>
      </Reveal>
    </LandingSection>
  );
}
