import { Reveal } from "@/components/layout/PageReveal";
import { LandingAudienceFeatureCards } from "@/features/landing/components/LandingAudienceFeatureCards";
import { LandingSection } from "@/features/landing/components/LandingSection";
import { useLandingPageContent } from "@/features/landing/context/LandingPageContentContext";
import type { LandingAudienceSegment } from "@/features/landing/content/niche/types";

function AudienceDescriptionSegment({ segment }: { segment: LandingAudienceSegment }) {
  if ("highlight" in segment) {
    return (
      <span className="rounded-[2px] bg-background px-0.5 font-normal text-primary">{segment.highlight}</span>
    );
  }
  return <>{segment.text}</>;
}

export function LandingAudienceSection() {
  const { audience } = useLandingPageContent();

  return (
    <LandingSection
      id="para-quem"
      variant="contrast"
      className="flex min-h-[100svh] flex-col justify-start pb-12 pt-10 md:pb-16 md:pt-12 lg:pt-14"
    >
      <Reveal index={0}>
        <header className="mx-auto mb-0 max-w-4xl px-2 text-center lg:max-w-5xl xl:max-w-6xl">
          <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl md:text-4xl">
            <span className="landing-audience__title-line">{audience.titleLine}</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white sm:text-base md:text-lg">
            {audience.descriptionParagraphs.map((paragraph) => (
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
