import { Reveal } from "@/components/layout/PageReveal";
import { FINAL_CTA } from "@/features/landing/content/landingContent";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";
import { LandingTrustBadges } from "@/features/landing/components/LandingTrustBadges";

export function LandingCta() {
  return (
    <LandingSection variant="contrast" narrow className="py-20 md:py-28">
      <div className="text-center">
        <Reveal index={0}>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-primary-foreground text-balance">
            {FINAL_CTA.title}
          </h2>
        </Reveal>
        <Reveal index={1}>
          <p className="mt-4 text-primary-foreground/80 text-base md:text-lg leading-relaxed max-w-xl mx-auto">
            {FINAL_CTA.description}
          </p>
        </Reveal>
        <Reveal index={2}>
          <LandingPrimaryCta
            className="mt-8 justify-center"
            primaryLabel={FINAL_CTA.button}
            inverted
          />
        </Reveal>
        <Reveal index={3}>
          <LandingTrustBadges className="mt-6 justify-center" inverted />
        </Reveal>
      </div>
    </LandingSection>
  );
}
