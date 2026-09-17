import {
  PROFESSIONAL_SPECIALTY_QUERY_PARAM,
  type ProfessionalSpecialty,
} from "@/lib/professionalSpecialty";
import type { NicheLandingConfig, LandingPageContent } from "@/features/landing/content/niche/types";
import { SOCIAL_PROOF_STATS } from "@/features/landing/content/landingContent";

export const SIGNUP_PATH = "/cadastro" as const;
export const SIGNUP_PATH_LEGACY = "/signup" as const;

export function buildSignupHref(specialty: ProfessionalSpecialty | null): string {
  if (!specialty) return SIGNUP_PATH_LEGACY;
  const params = new URLSearchParams({ [PROFESSIONAL_SPECIALTY_QUERY_PARAM]: specialty });
  return `${SIGNUP_PATH}?${params.toString()}`;
}

export function nicheConfigToLandingContent(config: NicheLandingConfig): LandingPageContent {
  return {
    seo: config.seo,
    primarySignupHref: buildSignupHref(config.signupSpecialty),
    hero: {
      eyebrow: config.hero.eyebrow,
      headlineLines: config.hero.headlineLines,
      subheadline: config.hero.subheadline,
      layout: "single",
      illustration: config.hero.illustration,
      ctaPrimary: config.hero.ctaPrimary,
      ctaSecondary: config.hero.ctaSecondary,
      secondaryHref: config.hero.secondaryHref,
    },
    audience: config.audience,
    socialProof: {
      ...config.socialProof,
      stats: SOCIAL_PROOF_STATS,
    },
    faqItems: config.faqItems,
  };
}
