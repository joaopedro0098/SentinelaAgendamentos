import { lazy, Suspense } from "react";
import { Reveal } from "@/components/layout/PageReveal";
import { LANDING_HERO } from "@/features/landing/content/landingContent";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";
import { LandingTrustBadges } from "@/features/landing/components/LandingTrustBadges";

const LandingPanelPreview = lazy(() =>
  import("@/features/landing/components/LandingPanelPreview").then((m) => ({
    default: m.LandingPanelPreview,
  })),
);

function PreviewFallback() {
  return (
    <div
      className="mx-auto w-full max-w-xl lg:max-w-none rounded-2xl border border-border/70 bg-card/60 shadow-soft h-[18rem] md:min-h-[22rem] animate-pulse"
      aria-hidden
    />
  );
}

export function LandingHero() {
  return (
    <section className="relative pt-24 md:pt-32 pb-12 md:pb-20 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] md:h-[32rem] landing-hero-glow"
        aria-hidden
      />

      <div className="container relative">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="text-center lg:text-left min-w-0">
            <Reveal index={0}>
              <p className="landing-eyebrow text-primary mb-4">{LANDING_HERO.eyebrow}</p>
            </Reveal>
            <Reveal index={1}>
              <h1 className="font-display text-[1.75rem] sm:text-4xl md:text-[2.75rem] lg:text-[3rem] font-semibold leading-[1.12] tracking-tight text-foreground text-balance">
                {LANDING_HERO.headline}
              </h1>
            </Reveal>
            <Reveal index={2}>
              <p className="mt-5 text-[15px] sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-balance">
                {LANDING_HERO.subheadline}
              </p>
            </Reveal>
            <Reveal index={3}>
              <LandingPrimaryCta
                className="mt-8 justify-center lg:justify-start"
                primaryLabel={LANDING_HERO.ctaPrimary}
                secondaryLabel={LANDING_HERO.ctaSecondary}
                secondaryHref="#como-funciona"
              />
            </Reveal>
            <Reveal index={4}>
              <LandingTrustBadges className="mt-6 justify-center lg:justify-start" />
            </Reveal>
          </div>

          <Reveal index={5} className="min-w-0 w-full">
            <Suspense fallback={<PreviewFallback />}>
              <LandingPanelPreview />
            </Suspense>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
