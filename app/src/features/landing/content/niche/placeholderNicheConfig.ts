import { LANDING_FAQ_ITEMS } from "@/features/landing/content/landingContent";
import type { ProfessionalSpecialty } from "@/lib/professionalSpecialty";
import type { HeroIllustrationKey, NicheLandingConfig } from "@/features/landing/content/niche/types";

type PlaceholderNicheInput = {
  path: NicheLandingConfig["path"];
  signupSpecialty: ProfessionalSpecialty;
  nicheLabel: string;
  illustration: HeroIllustrationKey;
};

/** Copy placeholder — substituir na etapa de conteúdo final. */
export function createPlaceholderNicheConfig(input: PlaceholderNicheInput): NicheLandingConfig {
  const { path, signupSpecialty, nicheLabel, illustration } = input;
  return {
    path,
    signupSpecialty,
    seo: {
      title: `[Placeholder] Sentinela — ${nicheLabel}`,
      description: `[Placeholder] Sistema de agendamentos para ${nicheLabel.toLowerCase()}. Conteúdo final em breve.`,
    },
    hero: {
      eyebrow: `[Placeholder] ${nicheLabel}`,
      headlineLines: ["Headline placeholder", "para validação", "da estrutura"],
      subheadline: `[Placeholder] Subtítulo focado em ${nicheLabel.toLowerCase()} — texto final depois.`,
      illustration,
      ctaPrimary: "Testar 14 dias grátis",
      ctaSecondary: "Ver como funciona",
      secondaryHref: "#como-funciona",
    },
    audience: {
      titleLine: `[Placeholder] Por que ${nicheLabel}?`,
      descriptionParagraphs: [
        [
          { text: "[Placeholder] Parágrafo de dor/benefício " },
          { highlight: nicheLabel },
          { text: " — copy final depois." },
        ],
      ],
    },
    socialProof: {
      eyebrow: "Quem já usa",
      title: `[Placeholder] Depoimento ${nicheLabel}`,
      description: "Veja o que profissionais destacam no dia a dia.",
      testimonials: [
        {
          id: "placeholder-1",
          quote: `[Placeholder] Depoimento único para ${nicheLabel}.`,
          name: "Profissional A.",
          role: `${nicheLabel} — Cidade, UF`,
          initials: "PA",
        },
      ],
    },
    faqItems: LANDING_FAQ_ITEMS,
  };
}
