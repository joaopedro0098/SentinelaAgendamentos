import { Reveal } from "@/components/layout/PageReveal";
import { LANDING_HERO_TRUST_ITEMS } from "@/features/landing/content/landingContent";
import { LandingPrimaryCta } from "@/features/landing/components/LandingPrimaryCta";
import { LandingTrustBadges } from "@/features/landing/components/LandingTrustBadges";
import { useLandingPageContent } from "@/features/landing/context/LandingPageContentContext";
import type { HeroIllustrationKey } from "@/features/landing/content/niche/types";
import { cn } from "@/lib/utils";

const HERO_ILLUSTRATION_SRC: Record<HeroIllustrationKey, string> = {
  doctor: "/landing-hero-doctor.png",
  psychologist: "/landing-hero-psychologist.png",
  dentist: "/landing-hero-dentistas.jpg",
};

const HERO_ILLUSTRATION_LABEL: Record<HeroIllustrationKey, string> = {
  doctor: "Ilustração de profissional de saúde em atendimento",
  psychologist: "Ilustração de atendimento psicológico",
  dentist: "Dentista em atendimento no consultório",
};

export function LandingHero() {
  const { hero, primarySignupHref } = useLandingPageContent();
  const isDual = hero.layout === "dual";
  const isDentistPhoto = !isDual && hero.illustration === "dentist";

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
                <p className="landing-eyebrow landing-hero__eyebrow text-primary mb-4">{hero.eyebrow}</p>
              </Reveal>
              <Reveal index={1}>
                <h1 className="landing-hero__headline font-display text-[1.75rem] sm:text-4xl md:text-[2.75rem] lg:text-[3rem] font-semibold leading-[1.12] tracking-tight text-foreground mx-auto lg:mx-0">
                  {hero.headlineLines.map((line) => (
                    <span key={line} className="landing-hero__headline-line">
                      {line}
                    </span>
                  ))}
                </h1>
              </Reveal>
              <Reveal index={2}>
                <p className="landing-hero__sub mt-5 whitespace-pre-line text-[15px] sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0 text-balance">
                  {hero.subheadline}
                </p>
              </Reveal>
            </div>
            <div className="landing-hero__actions">
              <Reveal index={3}>
                <LandingPrimaryCta
                  className="mt-8 lg:mt-0 justify-center lg:justify-start"
                  primaryLabel={hero.ctaPrimary}
                  primaryHref={primarySignupHref}
                  secondaryLabel={hero.ctaSecondary}
                  secondaryHref={hero.secondaryHref}
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
          className={cn(
            "relative z-0 w-full shrink-0 px-4 sm:px-6 lg:px-0 lg:-ml-2 xl:-ml-4 pointer-events-none",
            isDentistPhoto
              ? "lg:-mt-[5px] lg:flex lg:flex-1 lg:min-w-0 lg:flex-col lg:justify-end lg:max-w-xl xl:max-w-2xl landing-hero__visual--dentist"
              : "lg:-mt-6 xl:-mt-8 lg:flex-1 lg:min-w-[min(100%,520px)] lg:max-w-none",
          )}
        >
          <div
            className={cn(
              "landing-hero-illustrations mx-auto w-full max-w-3xl lg:mx-0 lg:max-w-none",
              !isDual && "landing-hero-illustrations--single",
              !isDual &&
                hero.illustration === "psychologist" &&
                "landing-hero-illustrations--psychologist-solo",
              isDentistPhoto && "landing-hero-illustrations--dentist-photo",
            )}
            role="img"
            aria-label={HERO_ILLUSTRATION_LABEL[hero.illustration ?? "psychologist"]}
          >
            {isDual ? (
              <>
                <img
                  className="landing-hero-illustrations__piece landing-hero-illustrations__piece--doctor"
                  src={HERO_ILLUSTRATION_SRC.doctor}
                  alt=""
                  width={800}
                  height={800}
                  fetchPriority="high"
                  decoding="async"
                />
                <img
                  className="landing-hero-illustrations__piece landing-hero-illustrations__piece--psychologist"
                  src={HERO_ILLUSTRATION_SRC.psychologist}
                  alt=""
                  width={800}
                  height={800}
                  decoding="async"
                />
              </>
            ) : isDentistPhoto ? (
              <>
                <img
                  className="landing-hero-illustrations__piece landing-hero-illustrations__piece--dentist"
                  src={HERO_ILLUSTRATION_SRC.dentist}
                  alt=""
                  width={1280}
                  height={720}
                  fetchPriority="high"
                  decoding="async"
                />
                <span className="landing-hero-illustrations__fade" aria-hidden />
              </>
            ) : (
              <img
                className={cn(
                  "landing-hero-illustrations__piece",
                  hero.illustration === "doctor"
                    ? "landing-hero-illustrations__piece--doctor"
                    : "landing-hero-illustrations__piece--psychologist",
                )}
                src={HERO_ILLUSTRATION_SRC[hero.illustration ?? "psychologist"]}
                alt=""
                width={800}
                height={800}
                fetchPriority="high"
                decoding="async"
              />
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
