/** Conteúdo reutilizável da landing — edite aqui para páginas de nicho futuras. */

export const LANDING_TRUST_ITEMS = [
  { id: "no-card", label: "Não é necessário cartão de crédito", icon: "credit-card" },
  { id: "whatsapp-support", label: "Suporte via WhatsApp", icon: "shield-check" },
] as const;

export type LandingTrustItem = (typeof LANDING_TRUST_ITEMS)[number];

/** Garantias exibidas só abaixo do CTA do hero (primeira dobra). */
export const LANDING_HERO_TRUST_ITEMS = [LANDING_TRUST_ITEMS[0]] as const;

export const LANDING_HERO = {
  eyebrow: "Gestão para consultórios e clínicas",
  headlineLines: [
    "Menos tempo organizando",
    "agenda. Mais tempo com",
    "seus pacientes",
  ],
  subheadline:
    "Agendamento online, prontuário simples e visão do consultório em um só lugar.",
  ctaPrimary: "Testar 14 dias grátis",
  ctaSecondary: "Ver como funciona",
} as const;

export const QUER_MAIS_CTA = {
  headline: "Fez sentido para você?",
  ouLabel: "OU",
  whatsAppCaptionLines: ["Chame-nos no WhatsApp.", "Para mais informações."] as const,
} as const;

export const LANDING_AUDIENCE = {
  titleLine: "Por que usar o Sentinela Agendamentos?",
  descriptionParagraphs: [
    [
      { text: "Do profissional " },
      { highlight: "autônomo" },
      { text: " à " },
      { highlight: "clínica com equipe" },
      { text: ": o Sentinela cresce junto com você." },
    ],
    [
      { text: "Comece simples e ative recursos mais avançados " },
      { highlight: "conforme sua necessidade" },
      { text: " aumenta." },
    ],
  ],
  featureCards: [
    {
      id: "whatsapp-auto",
      icon: "whatsapp",
      title: "Envio automático de mensagem",
      description:
        "Seus pacientes receberão confirmações automáticas no WhatsApp, reduzindo faltas e liberando espaço na sua agenda.",
    },
    {
      id: "video-call-transcription",
      icon: "video-call",
      title: "Video chamada com resumo",
      description:
        "Faça sua vídeo chamada sem precisar acessar outro sistema. O Sentinela te dará a opção de transcrever e resumir todo o atendimento de forma automática com inteligência artificial.",
    },
    {
      id: "payment-link",
      icon: "payment-link",
      title: "Link de pagamento",
      description:
        "Permita que seus pacientes paguem via PIX ou cartão, integral ou parcialmente, para confirmar o agendamento e reduzir faltas.",
    },
    {
      id: "schedule-panel",
      icon: "schedule-panel",
      title: "Prontuário completo",
      description:
        "Adicione e gerencie pacientes de forma intuitiva e rápida, suba documentos, laudos e exames, faça anotações em cada atendimento.",
    },
  ],
} as const;

export type LandingAudienceFeatureCard = (typeof LANDING_AUDIENCE.featureCards)[number];

/** Copy do card “Video chamada com resumo” — landing principal (home). */
export const LANDING_AUDIENCE_VIDEO_CALL_DESCRIPTION_HOME =
  "Atenda por vídeo chamada sem sair do Sentinela. Caso você precise, nossa inteligência Artificial transcreve e resume o atendimento para você.";

/** Copy do card “Video chamada com resumo” — landing /psicologos. */
export const LANDING_AUDIENCE_VIDEO_CALL_DESCRIPTION_PSICOLOGOS =
  "Realize suas sessões por vídeo chamada sem sair do Sentinela. Você poderá transcrever e resumir o atendimento automaticamente, através da nossa inteligência artificial.";

export function landingAudienceFeatureCardsWithOverrides(
  overrides: Partial<Record<LandingAudienceFeatureCard["id"], Pick<LandingAudienceFeatureCard, "description">>>,
): LandingAudienceFeatureCard[] {
  return LANDING_AUDIENCE.featureCards.map((card) => {
    const patch = overrides[card.id];
    return patch ? { ...card, ...patch } : card;
  });
}

export const HOW_IT_WORKS_STEPS = [
  {
    step: "1",
    title: "Crie sua conta",
    description: "Cadastro em poucos minutos. Teste grátis por 14 dias, sem cartão.",
  },
  {
    step: "2",
    title: "Configure sua disponibilidade",
    description: "Defina horários, serviços e gere seu link de agendamento personalizado.",
  },
  {
    step: "3",
    title: "Faça os agendamentos",
    description: "Pronto, agora é só agendar e gerenciar",
  },
] as const;

/** Placeholders — substitua por depoimentos reais quando disponíveis. */
export const SOCIAL_PROOF_STATS = [
  { value: "500+", label: "profissionais cadastrados" },
  { value: "9.6/10", label: "satisfação média" },
] as const;

export const TESTIMONIALS = [
  {
    id: "1",
    quote:
      "Antes eu passava o intervalo entre sessões confirmando horário no WhatsApp. Hoje o paciente agenda sozinho e eu só abro o painel de manhã.",
    name: "Dra. Mariana S.",
    role: "Psicóloga — São Paulo, SP",
    initials: "MS",
  },
  {
    id: "2",
    quote:
      "O que mais me surpreendeu foi a simplicidade. Em um dia já estava com a agenda da clínica rodando para três profissionais.",
    name: "Dr. Rafael T.",
    role: "Médico — Belo Horizonte, MG",
    initials: "RT",
  },
  {
    id: "3",
    quote:
      "Os relatórios me mostram quantas consultas faltaram no mês. Isso mudou como eu organizo a agenda e cobro retornos.",
    name: "Ana Paula M.",
    role: "Nutricionista — Curitiba, PR",
    initials: "AM",
  },
] as const;

/** FAQ padrão — todas as landings de nicho (somente estas quatro). */
export const LANDING_FAQ_ITEMS = [
  {
    id: "trial",
    question: "O teste grátis de 14 dias é realmente sem compromisso?",
    answer:
      "Sim, e você não precisa inserir cartão. Você poderá usar as principais funções do site e já começar a trabalhar; a única função restrita ao plano pago é o envio de confirmação automática por WhatsApp.",
  },
  {
    id: "comecar",
    question: "O que preciso pra começar agora?",
    answer:
      "Você pode começar por conta própria: crie sua conta, configure sua disponibilidade e pronto — já pode receber agendamentos. Ou nos acione para uma call com compartilhamento de tela, em que explicamos o sistema de forma mais ampla.",
  },
  {
    id: "suporte",
    question: "Quanto tempo demora o suporte?",
    answer:
      "Esse é um dos nossos diferenciais: tanto o suporte quanto a resolução dos casos são realizados sempre no mesmo dia do acionamento.",
  },
  {
    id: "autonomo-clinica",
    question: "O sistema é só para quem tem clínica ou para quem é autônomo também?",
    answer:
      "Serve para os dois. Você pode iniciar os atendimentos adicionando somente você como profissional e ir agregando mais profissionais com o decorrer do tempo.",
  },
] as const;

/** Landing principal: FAQ padrão + especialidade. */
export const LANDING_HOME_FAQ_ITEMS = [
  ...LANDING_FAQ_ITEMS,
  {
    id: "especialidade",
    question: "Funciona para a minha especialidade?",
    answer:
      "O Sentinela foi pensado para profissionais de saúde e bem-estar: psicólogos, médicos, nutricionistas, dentistas e outras áreas com atendimento por hora marcada.",
  },
] as const;
