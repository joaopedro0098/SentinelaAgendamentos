import {
  LANDING_AUDIENCE,
  LANDING_AUDIENCE_VIDEO_CALL_DESCRIPTION_PSICOLOGOS,
  landingAudienceFeatureCardsWithOverrides,
} from "@/features/landing/content/landingContent";
import { createPlaceholderNicheConfig } from "@/features/landing/content/niche/placeholderNicheConfig";

const base = createPlaceholderNicheConfig({
  path: "/psicologos",
  signupSpecialty: "psicologo",
  nicheLabel: "Psicólogos",
  illustration: "psychologist",
});

export const psicologosLandingConfig = {
  ...base,
  hero: {
    ...base.hero,
    eyebrow: "Sistema de gestão para psicólogos",
    headlineLines: [
      "Menos tempo organizando",
      "agenda. Mais tempo com",
      "seus pacientes",
    ] as const,
    subheadline:
      "Agendamento online, prontuário psicológico\ne visão do consultório em um só lugar.",
  },
  audience: {
    titleLine: LANDING_AUDIENCE.titleLine,
    descriptionParagraphs: LANDING_AUDIENCE.descriptionParagraphs,
    featureCards: landingAudienceFeatureCardsWithOverrides({
      "video-call-transcription": {
        description: LANDING_AUDIENCE_VIDEO_CALL_DESCRIPTION_PSICOLOGOS,
      },
    }),
  },
};
