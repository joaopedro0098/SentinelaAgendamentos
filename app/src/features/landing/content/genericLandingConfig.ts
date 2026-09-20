import {
  LANDING_HOME_FAQ_ITEMS,
  LANDING_AUDIENCE,
  LANDING_AUDIENCE_VIDEO_CALL_DESCRIPTION_HOME,
  LANDING_HERO,
  SOCIAL_PROOF_STATS,
  TESTIMONIALS,
  landingAudienceFeatureCardsWithOverrides,
} from "@/features/landing/content/landingContent";
import type { LandingPageContent } from "@/features/landing/content/niche/types";
import { buildSignupHref } from "@/features/landing/content/niche/shared";

export const GENERIC_LANDING_PAGE_CONTENT: LandingPageContent = {
  primarySignupHref: buildSignupHref(null),
  hero: {
    eyebrow: LANDING_HERO.eyebrow,
    headlineLines: LANDING_HERO.headlineLines,
    subheadline: LANDING_HERO.subheadline,
    layout: "dual",
    ctaPrimary: LANDING_HERO.ctaPrimary,
    ctaSecondary: LANDING_HERO.ctaSecondary,
    secondaryHref: "#como-funciona",
  },
  audience: {
    titleLine: LANDING_AUDIENCE.titleLine,
    descriptionParagraphs: LANDING_AUDIENCE.descriptionParagraphs,
    featureCards: landingAudienceFeatureCardsWithOverrides({
      "video-call-transcription": {
        description: LANDING_AUDIENCE_VIDEO_CALL_DESCRIPTION_HOME,
      },
    }),
  },
  socialProof: {
    eyebrow: "Quem já usa",
    title: "Profissionais que recuperaram tempo na agenda",
    description: "Veja o que nossos usuários destacam no dia a dia.",
    stats: SOCIAL_PROOF_STATS,
    testimonials: TESTIMONIALS,
  },
  faqItems: LANDING_HOME_FAQ_ITEMS,
};
