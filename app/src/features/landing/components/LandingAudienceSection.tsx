import { Reveal } from "@/components/layout/PageReveal";
import { LANDING_AUDIENCE } from "@/features/landing/content/landingContent";
import { LandingAudienceFeatureCards } from "@/features/landing/components/LandingAudienceFeatureCards";
import { LandingSection } from "@/features/landing/components/LandingSection";

type AudienceDescriptionSegment =
  (typeof LANDING_AUDIENCE.descriptionParagraphs)[number][number];

function AudienceDescriptionSegment({ segment }: { segment: AudienceDescriptionSegment }) {
  if ("highlight" in segment) {
    return (
      <span className="font-bold text-[17px] sm:text-[18px] md:text-[20px]">{segment.highlight}</span>
    );
  }
  return <>{segment.text}</>;
}

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
            {LANDING_AUDIENCE.descriptionParagraphs.map((paragraph) => (
              <span
                key={paragraph.map((s) => ("highlight" in s ? s.highlight : s.text)).join("")}
                className="landing-audience__desc-line"
              >
                {paragraph.map((segment, index) => (
                  <AudienceDescriptionSegment key={index} segment={segment} />
                ))}
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
