import {
  LANDING_AUDIENCE,
  type LandingAudienceFeatureCard,
} from "@/features/landing/content/landingContent";
import { LandingWhatsAppIcon } from "@/features/landing/components/LandingWhatsAppIcon";
import { useLandingPageContent } from "@/features/landing/context/LandingPageContentContext";

type AudienceFeatureCard = LandingAudienceFeatureCard;

const CARD_ILLUSTRATIONS: Partial<Record<NonNullable<AudienceFeatureCard["icon"]>, string>> = {
  "schedule-panel": "/landing-audience-prontuario.png",
  "payment-link": "/landing-audience-payment-link.png",
  "video-call": "/landing-audience-video-call.png",
};

function FeatureCardLeadingVisual({ icon }: { icon: AudienceFeatureCard["icon"] }) {
  if (icon === "whatsapp") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        <LandingWhatsAppIcon className="h-10 w-10" opticalScale={1.08} />
      </div>
    );
  }
  const illustrationSrc = icon ? CARD_ILLUSTRATIONS[icon] : undefined;
  if (illustrationSrc) {
    const illustrationLift =
      icon === "payment-link"
        ? "-translate-y-1.5"
        : icon === "schedule-panel"
          ? "-translate-y-[5px]"
          : "";
    return (
      <div className="flex h-10 w-10 shrink-0 items-start justify-start rounded-lg">
        <img
          src={illustrationSrc}
          alt=""
          className={`h-9 w-9 object-contain object-left-top ${illustrationLift}`}
          decoding="async"
        />
      </div>
    );
  }
  return null;
}

export function LandingAudienceFeatureCards() {
  const { audience } = useLandingPageContent();
  const cards = audience.featureCards ?? LANDING_AUDIENCE.featureCards;

  return (
    <div className="mx-auto mt-10 grid w-full max-w-6xl grid-cols-1 gap-4 px-2 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
      {cards.map((card) => (
          <article
            key={card.id}
            className="flex min-h-[17rem] flex-col rounded-xl bg-background p-5 text-left text-foreground md:min-h-[18.5rem] md:p-6"
          >
            <div className="mb-3 flex items-start gap-3">
              <FeatureCardLeadingVisual icon={card.icon} />
              <h3 className="font-display m-0 min-w-0 flex-1 p-0 text-base font-semibold leading-snug md:text-[17px]">
                {Array.isArray(card.title)
                  ? card.title.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))
                  : card.title}
              </h3>
            </div>
            <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
          </article>
        ))}
    </div>
  );
}
