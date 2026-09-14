import { Reveal } from "@/components/layout/PageReveal";
import { LANDING_HERO, LANDING_HERO_TRUST_ITEMS } from "@/features/landing/content/landingContent";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";
import { LandingTrustBadges } from "@/features/landing/components/LandingTrustBadges";

const HERO_ILLUSTRATION_DOCTOR = "/landing-hero-doctor.png";
const HERO_ILLUSTRATION_PSYCHOLOGIST = "/landing-hero-psychologist.png";

export function LandingHero() {
  return (
    <section className="landing-hero relative flex flex-col bg-background min-h-[100svh] pt-24 md:pt-32 pb-6 md:pb-10 overflow-x-clip">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] md:h-[32rem] landing-hero-glow"
        aria-hidden
      />

      <div className="landing-hero__stage relative flex flex-1 flex-col lg:flex-row lg:items-stretch gap-10 lg:gap-8 xl:gap-10">
        <div className="landing-hero__copy w-full px-4 sm:px-6 lg:px-0 lg:w-[44%] lg:max-w-xl xl:max-w-2xl lg:shrink-0 lg:pl-[max(2rem,calc((100vw-1400px)/2+2rem))]">
          <div className="landing-hero__copy-inner text-center lg:text-left">
            <div className="landing-hero__copy-intro">
              <Reveal index={0}>
                <p className="landing-eyebrow landing-hero__eyebrow text-primary mb-4">{LANDING_HERO.eyebrow}</p>
              </Reveal>
              <Reveal index={1}>
                <h1 className="landing-hero__headline font-display text-[1.75rem] sm:text-4xl md:text-[2.75rem] lg:text-[3rem] font-semibold leading-[1.12] tracking-tight text-foreground mx-auto lg:mx-0">
                  {LANDING_HERO.headlineLines.map((line) => (
                    <span key={line} className="landing-hero__headline-line">
                      {line}
                    </span>
                  ))}
                </h1>
              </Reveal>
              <Reveal index={2}>
                <p className="landing-hero__sub mt-5 text-[15px] sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-balance">
                  {LANDING_HERO.subheadline}
                </p>
              </Reveal>
            </div>
            <div className="landing-hero__actions">
              <Reveal index={3}>
                <LandingPrimaryCta
                  className="mt-8 lg:mt-0 justify-center lg:justify-start"
                  primaryLabel={LANDING_HERO.ctaPrimary}
                  secondaryLabel={LANDING_HERO.ctaSecondary}
                  secondaryHref="#como-funciona"
                />
              </Reveal>
              <Reveal index={4}>
                <LandingTrustBadges
                  className="mt-6 justify-center lg:justify-start"
                  items={LANDING_HERO_TRUST_ITEMS}
                  size="comfortable"
                />
              </Reveal>
            </div>
          </div>
        </div>

        <Reveal
          index={5}
          className="relative z-0 w-full shrink-0 px-4 sm:px-6 lg:px-0 lg:flex-1 lg:min-w-[min(100%,520px)] lg:max-w-none lg:-mt-6 xl:-mt-8 lg:-ml-2 xl:-ml-4 pointer-events-none"
        >
          <div
            className="landing-hero-illustrations mx-auto w-full max-w-3xl lg:mx-0 lg:max-w-none"
            role="img"
            aria-label="Ilustrações de profissionais de saúde e atendimento clínico"
          >
            <img
              className="landing-hero-illustrations__piece landing-hero-illustrations__piece--doctor"
              src={HERO_ILLUSTRATION_DOCTOR}
              alt=""
              width={800}
              height={800}
              fetchPriority="high"
              decoding="async"
            />
            <img
              className="landing-hero-illustrations__piece landing-hero-illustrations__piece--psychologist"
              src={HERO_ILLUSTRATION_PSYCHOLOGIST}
              alt=""
              width={800}
              height={800}
              decoding="async"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
