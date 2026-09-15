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
  headline: "Está esperando o que?",
  ouLabel: "Ou",
  whatsAppLead: "Nos chame no WhatsApp para mais informações!",
  whatsAppButton: "Falar no WhatsApp",
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
        "Seus pacientes receberão uma mensagem automática no WhatsApp um dia antes para confirmar o agendamento e um lembrete opcional três horas antes do seu atendimento. Assim você diminui o não comparecimento e abre espaço na sua agenda para outro paciente.",
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
        "Cobre seus pacientes antecipadamente, de forma parcial ou total, via PIX ou cartão. Isso aumenta o compromisso com o agendamento e reduz faltas.",
    },
    {
      id: "schedule-panel",
      icon: "schedule-panel",
      title: ["Painel dinâmico", "de agendamentos"],
      description:
        "Pensamos no painel mais intuitivo possível para você visualizar sua disponibilidade da semana e do mês, podendo assim criar, remarcar e excluir agendamentos de forma rápida e com poucos cliques num só lugar.",
    },
  ],
} as const;

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
  { value: "10 mil+", label: "agendamentos realizados" },
  { value: "4,8/5", label: "satisfação média" },
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

export const FAQ_ITEMS = [
  {
    id: "autonomo",
    question: "Não tenho clínica ou consultório, posso usar o Sentinela como autônomo(a)?",
    answer:
      "Sim. O Sentinela funciona para profissionais autônomos que atendem em consultório próprio, coworking ou teleconsulta. Você configura sua agenda, serviços e link personalizado sem precisar de clínica ou equipe.",
  },
  {
    id: "trial",
    question: "O teste grátis de 14 dias é realmente sem compromisso?",
    answer:
      "Sim. Você usa todas as funcionalidades do plano escolhido por 14 dias sem informar cartão de crédito. Só assina se fizer sentido para o seu consultório.",
  },
  {
    id: "especialidade",
    question: "Funciona para a minha especialidade?",
    answer:
      "O Sentinela foi pensado para profissionais de saúde e bem-estar: psicólogos, médicos, nutricionistas, dentistas e outras áreas com atendimento por hora marcada.",
  },
  {
    id: "equipe",
    question: "Posso adicionar outros profissionais da clínica?",
    answer:
      "Sim. Você pode cadastrar colaboradores ilimitados, cada um com sua agenda, serviços e bloqueios de horário.",
  },
  {
    id: "pagamento",
    question: "O paciente pode pagar antecipado ao agendar?",
    answer:
      "No plano Pro, sim. O paciente pode pagar o valor integral ou parcial para confirmar o horário. No plano Start, o agendamento online funciona sem cobrança antecipada.",
  },
  {
    id: "suporte",
    question: "Como funciona o suporte?",
    answer:
      "Nosso suporte é humanizado via WhatsApp. Você fala com pessoas reais que conhecem o sistema — não com robôs.",
  },
] as const;
