import { LANDING_AUDIENCE } from "@/features/landing/content/landingContent";
import { LandingWhatsAppIcon } from "@/features/landing/components/LandingWhatsAppIcon";

type AudienceFeatureCard = (typeof LANDING_AUDIENCE.featureCards)[number];

const CARD_ILLUSTRATIONS: Partial<Record<NonNullable<AudienceFeatureCard["icon"]>, string>> = {
  "schedule-panel": "/landing-audience-schedule-panel.png",
  "payment-link": "/landing-audience-payment-link.png",
  "video-call": "/landing-audience-video-call.png",
};

function FeatureCardLeadingVisual({ icon }: { icon: AudienceFeatureCard["icon"] }) {
  if (icon === "whatsapp") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-white">
        <LandingWhatsAppIcon className="h-5 w-5" />
      </div>
    );
  }
  const illustrationSrc = icon ? CARD_ILLUSTRATIONS[icon] : undefined;
  if (illustrationSrc) {
    const illustrationLift = icon === "payment-link" ? "-translate-y-1.5" : "";
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
  return (
    <div className="mx-auto mt-10 grid w-full max-w-6xl grid-cols-1 gap-4 px-2 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
      {LANDING_AUDIENCE.featureCards.map((card) => {
        const hasContent = Array.isArray(card.title)
          ? card.title.some((line) => line.trim())
          : Boolean(card.title.trim());
        return (
          <article
            key={card.id}
            className="flex min-h-[17rem] flex-col rounded-xl bg-background p-5 text-left text-foreground md:min-h-[18.5rem] md:p-6"
          >
            {hasContent ? (
              <>
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
              </>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
