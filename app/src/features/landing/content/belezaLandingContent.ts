import {
  LANDING_AUDIENCE,
  LANDING_FAQ_ITEMS,
  landingAudienceFeatureCardsWithOverrides,
} from "@/features/landing/content/landingContent";
import { GENERIC_LANDING_PAGE_CONTENT } from "@/features/landing/content/genericLandingConfig";
import { buildSignupHref } from "@/features/landing/content/niche/shared";
import type { LandingPageContent } from "@/features/landing/content/niche/types";

const BELEZA_AUDIENCE_FEATURE_CARDS = landingAudienceFeatureCardsWithOverrides({
  "whatsapp-auto": {
    description:
      "Seus clientes receberão confirmações automáticas no WhatsApp, reduzindo faltas e liberando espaço na sua agenda.",
  },
  "video-call-transcription": {
    title: ["Faturamento", "e comissionamento"],
    description:
      "Acompanhe entradas, repasses e comissões da equipe em um painel claro — sem planilhas paralelas.",
    imageSrc: "/landing-audience-receita.png",
  },
  "payment-link": {
    description:
      "Permita que seus clientes paguem via PIX ou cartão, integral ou parcialmente, para confirmar o agendamento e reduzir faltas.",
  },
  "schedule-panel": {
    title: ["Gerenciamento", "de estoque"],
    description:
      "Controle produtos e insumos com alertas de reposição e visão do que sai a cada atendimento — sem contagem no caderno.",
  },
});

const BELEZA_FAQ_ITEMS = [
  ...LANDING_FAQ_ITEMS.filter((item) => item.id !== "autonomo-clinica"),
  {
    id: "autonomo-salao",
    question: "O sistema é só para salão grande ou serve para quem trabalha sozinha também?",
    answer:
      "Serve para os dois. Você pode começar só com você na agenda e ir incluindo cabeleireiros, manicures e outros profissionais conforme o salão cresce.",
  },
  {
    id: "especialidade-beleza",
    question: "Funciona para o meu negócio de beleza?",
    answer:
      "Sim. O Sentinela foi pensado para salões de beleza, barbearias, nail designers e negócios com atendimento por hora marcada — da cadeira individual ao salão com equipe.",
  },
] as const;

/** Conteúdo completo da landing `/beleza` (única fonte — home e saúde usam `genericLandingConfig`). */
export const BELEZA_LANDING_PAGE_CONTENT: LandingPageContent = {
  primarySignupHref: buildSignupHref("salao_beleza"),
  hero: {
    ...GENERIC_LANDING_PAGE_CONTENT.hero,
    eyebrow: "Gestão para salão de beleza",
    headlineLines: [
      "Menos tempo organizando",
      "agenda. Mais tempo com",
      "seus clientes.",
    ],
    subheadline: "Agenda online, estoque, faturamento e mais, tudo em um só lugar",
    layout: "single",
    heroImageSrc: "/landing-hero-beleza.png",
    heroImageAlt: "Ilustração de clientes em salão de beleza",
  },
  audience: {
    titleLine: LANDING_AUDIENCE.titleLine,
    descriptionParagraphs: [
      [
        { text: "Do profissional " },
        { highlight: "autônomo" },
        { text: " ao " },
        { highlight: "salão com equipe" },
        { text: ": o Sentinela cresce junto com você." },
      ],
      [
        { text: "Comece simples e ative recursos mais avançados " },
        { highlight: "conforme sua necessidade" },
        { text: " aumenta." },
      ],
    ],
    featureCards: BELEZA_AUDIENCE_FEATURE_CARDS,
  },
  featuresShowcase: {
    description:
      "Um painel claro para quem atende no salão — não um sistema genérico que exige treinamento.",
    features: [
      {
        illustrationSrc: "/landing-quer-mais-support.png",
        titleLines: ["Suporte ágil e", "humanizado por", "WhatsApp"],
      },
      {
        illustrationSrc: "/landing-quer-mais-schedule-panel.png",
        titleLines: ["Painel dinâmico", "de agendamentos"],
      },
      {
        illustrationSrc: "/landing-quer-mais-collaborators.png",
        titleLines: ["Adicione colaboradores", "e os gerencie"],
      },
    ],
  },
  footerDescription:
    "Gestão de agenda e salão para profissionais de beleza. Simples, confiável e com suporte humanizado.",
  socialProof: {
    eyebrow: GENERIC_LANDING_PAGE_CONTENT.socialProof.eyebrow,
    title: "Profissionais de beleza que recuperaram tempo na agenda",
    description: GENERIC_LANDING_PAGE_CONTENT.socialProof.description,
    stats: GENERIC_LANDING_PAGE_CONTENT.socialProof.stats,
    testimonials: [
      {
        id: "1",
        quote:
          "Antes eu passava o intervalo entre clientes confirmando horário no WhatsApp. Hoje a cliente agenda sozinha e eu só abro o painel de manhã.",
        name: "Mariana S.",
        role: "",
        initials: "MS",
      },
      {
        id: "2",
        quote:
          "O que mais me surpreendeu foi a simplicidade. Em um dia já estava com a agenda do salão rodando para três profissionais.",
        name: "Rafael T.",
        role: "",
        initials: "RT",
      },
      {
        id: "3",
        quote:
          "Os relatórios me mostram quantos horários faltaram no mês. Isso mudou como eu organizo a agenda e cobro sinal nos serviços.",
        name: "Ana Paula M.",
        role: "",
        initials: "AM",
      },
    ],
  },
  faqItems: BELEZA_FAQ_ITEMS,
};
