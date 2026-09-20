import {
  LANDING_AUDIENCE,
  LANDING_AUDIENCE_VIDEO_CALL_DESCRIPTION_PSICOLOGOS,
  landingAudienceFeatureCardsWithOverrides,
} from "@/features/landing/content/landingContent";
import { createPlaceholderNicheConfig } from "@/features/landing/content/niche/placeholderNicheConfig";

const base = createPlaceholderNicheConfig({
  path: "/psicologia",
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
  socialProof: {
    ...base.socialProof,
    title: "Profissionais que recuperaram tempo na agenda",
    description: "Veja o que profissionais destacam no dia a dia.",
    testimonialQuoteClassName: "text-base md:text-[17px] text-foreground",
    testimonials: [
      {
        id: "psico-usabilidade",
        quote:
          "Já usei outros dois sistemas para psicólogos, e este foi, de longe, o mais intuitivo. Ele consegue ser fácil e completo ao mesmo tempo. Já recomendei para minhas colegas e elas gostaram muito também.",
        name: "Dra. Ana Paula M.",
        role: "Psicóloga — Curitiba, PR",
        initials: "AM",
      },
      {
        id: "psico-pagamento",
        quote:
          "Antes eu tinha muitas faltas. Pacientes desmarcavam em cima da hora. Hoje, com o link de pagamento, cobro um valor simbólico para confirmar a sessão de forma profissional. Diminuiu muito as faltas.",
        name: "Dra. Mariana S.",
        role: "Psicóloga — São Paulo, SP",
        initials: "MS",
      },
      {
        id: "psico-whatsapp",
        quote:
          "Adorei as confirmações automáticas no WhatsApp. O paciente recebe uma confirmação um dia antes e o sistema ainda dá a opção de deixar configurado para enviar um lembrete 3h antes da sessão.",
        name: "Dr. Rafael T.",
        role: "Psicólogo — Belo Horizonte, MG",
        initials: "RT",
      },
    ],
  },
};
