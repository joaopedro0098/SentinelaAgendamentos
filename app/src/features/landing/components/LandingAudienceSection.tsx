import { Reveal } from "@/components/layout/PageReveal";
import { LANDING_AUDIENCE } from "@/features/landing/content/landingContent";
import { LandingAudienceFeatureCards } from "@/features/landing/components/LandingAudienceFeatureCards";
import { LandingSection } from "@/features/landing/components/LandingSection";

export function LandingAudienceSection() {
  return (
    <LandingSection
      id="para-quem"
      variant="contrast"
      className="flex min-h-[100svh] flex-col justify-start pb-12 pt-10 md:pb-16 md:pt-12 lg:pt-14"
    >
      <Reveal index={0}>
        <header className="mx-auto mb-0 max-w-4xl px-2 text-center lg:max-w-5xl xl:max-w-6xl">
          <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl md:text-4xl">
            <span className="landing-audience__title-line">{LANDING_AUDIENCE.titleLine}</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white sm:text-base md:text-lg">
            {LANDING_AUDIENCE.descriptionLines.map((line) => (
              <span key={line} className="landing-audience__desc-line">
                {line}
              </span>
            ))}
          </p>
        </header>
      </Reveal>
      <Reveal index={1}>
        <LandingAudienceFeatureCards />
      </Reveal>
    </LandingSection>
  );
}
