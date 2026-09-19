import type { ProfessionalSpecialty } from "@/lib/professionalSpecialty";
import type { LandingAudienceFeatureCard } from "@/features/landing/content/landingContent";

export type HeroIllustrationKey = "doctor" | "psychologist" | "dentist";

export type LandingAudienceSegment =
  | { text: string }
  | { highlight: string };

export type LandingFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type LandingTestimonial = {
  id: string;
  quote: string;
  name: string;
  role: string;
  initials: string;
};

export type LandingSocialProofStat = {
  value: string;
  label: string;
};

export type NicheLandingConfig = {
  path: `/${string}`;
  seo: {
    title: string;
    description: string;
  };
  signupSpecialty: ProfessionalSpecialty;
  hero: {
    eyebrow: string;
    headlineLines: readonly string[];
    subheadline: string;
    illustration: HeroIllustrationKey;
    ctaPrimary: string;
    ctaSecondary: string;
    secondaryHref: string;
  };
  audience: {
    titleLine: string;
    descriptionParagraphs: readonly (readonly LandingAudienceSegment[])[];
    featureCards?: readonly LandingAudienceFeatureCard[];
  };
  socialProof: {
    eyebrow: string;
    title: string;
    description: string;
    testimonials: readonly LandingTestimonial[];
    testimonialQuoteClassName?: string;
  };
  faqItems: readonly LandingFaqItem[];
};

/** Conteúdo unificado da landing (home genérica ou nicho). */
export type LandingPageContent = {
  primarySignupHref: string;
  hero: {
    eyebrow: string;
    headlineLines: readonly string[];
    subheadline: string;
    layout: "dual" | "single";
    illustration?: HeroIllustrationKey;
    ctaPrimary: string;
    ctaSecondary: string;
    secondaryHref: string;
  };
  audience: {
    titleLine: string;
    descriptionParagraphs: readonly (readonly LandingAudienceSegment[])[];
    featureCards?: readonly LandingAudienceFeatureCard[];
  };
  socialProof: {
    eyebrow: string;
    title: string;
    description: string;
    stats: readonly LandingSocialProofStat[];
    testimonials: readonly LandingTestimonial[];
    testimonialQuoteClassName?: string;
  };
  faqItems: readonly LandingFaqItem[];
};
