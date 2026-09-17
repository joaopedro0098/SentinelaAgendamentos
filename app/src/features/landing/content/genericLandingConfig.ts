import {
  FAQ_ITEMS,
  LANDING_AUDIENCE,
  LANDING_HERO,
  SOCIAL_PROOF_STATS,
  TESTIMONIALS,
} from "@/features/landing/content/landingContent";
import type { LandingPageContent } from "@/features/landing/content/niche/types";
import { buildSignupHref } from "@/features/landing/content/niche/shared";

const HOME_TITLE = "Sentinela Agendamentos — Gestão de agenda para profissionais de saúde";
const HOME_DESCRIPTION =
  "Agendamento online, ficha de pacientes e gestão do consultório em um só lugar. Teste grátis por 14 dias, sem cartão. Para profissionais de saúde e bem-estar.";

export const GENERIC_LANDING_PAGE_CONTENT: LandingPageContent = {
  seo: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
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
  },
  socialProof: {
    eyebrow: "Quem já usa",
    title: "Profissionais que recuperaram tempo na agenda",
    description: "Veja o que nossos usuários destacam no dia a dia.",
    stats: SOCIAL_PROOF_STATS,
    testimonials: TESTIMONIALS,
  },
  faqItems: FAQ_ITEMS,
};
