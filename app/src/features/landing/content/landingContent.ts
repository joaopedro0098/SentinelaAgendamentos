/** Conteúdo reutilizável da landing — edite aqui para páginas de nicho futuras. */

export const LANDING_TRUST_ITEMS = [
  "14 dias grátis",
  "Sem cartão de crédito",
  "Suporte via WhatsApp",
] as const;

export const LANDING_HERO = {
  eyebrow: "Gestão para consultórios e clínicas",
  headline: "Menos tempo organizando agenda. Mais tempo com seus pacientes.",
  subheadline:
    "Agendamento online, prontuário simples e visão do consultório em um só lugar — feito para quem atende, não para quem programa software.",
  ctaPrimary: "Começar teste grátis",
  ctaSecondary: "Ver como funciona",
} as const;

export const PAIN_POINTS = [
  {
    id: "whatsapp",
    title: "Confirmações no WhatsApp o dia inteiro",
    description:
      "Cada mensagem de horário tira você do atendimento. Pacientes esperam resposta rápida, mas você não pode parar a cada notificação.",
  },
  {
    id: "agenda",
    title: "Agenda espalhada em papel, planilha e memória",
    description:
      "Um encaixe aqui, um retorno ali — sem uma visão clara da semana, faltas e buracos na agenda passam despercebidos.",
  },
  {
    id: "faltas",
    title: "Pacientes que faltam sem aviso",
    description:
      "Horário reservado, consultório vazio. Sem lembretes e confirmação antecipada, a agenda parece cheia — mas o faturamento não acompanha.",
  },
  {
    id: "visao",
    title: "Sem visão do que o consultório fatura",
    description:
      "No fim do mês, você ainda soma manualmente quantas consultas foram feitas, canceladas ou não pagas.",
  },
] as const;

export const SOLUTION_FEATURES = [
  {
    id: "agendamento",
    title: "Agendamento online 24 horas",
    description:
      "Seu paciente escolhe horário pelo link personalizado, sem precisar te mandar mensagem. Você define serviços, duração e disponibilidade.",
  },
  {
    id: "pacientes",
    title: "Ficha e histórico do paciente",
    description:
      "Anotações, documentos e dados cadastrais organizados por paciente — tudo acessível antes e depois da consulta.",
  },
  {
    id: "equipe",
    title: "Equipe e múltiplos profissionais",
    description:
      "Cada profissional com sua agenda, serviços e bloqueios. Ideal para consultórios com mais de um atendente.",
  },
  {
    id: "relatorios",
    title: "Relatórios do consultório",
    description:
      "Veja agendamentos concluídos, cancelados e faturamento por período. Decisões com base em números, não em achismo.",
  },
  {
    id: "pagamento",
    title: "Cobrança antecipada (opcional)",
    description:
      "No plano Pro, o paciente pode pagar total ou parcialmente ao agendar — reduzindo faltas e confirmando o horário.",
  },
  {
    id: "lembretes",
    title: "Lembretes automáticos",
    description:
      "Confirmações e avisos enviados para o paciente, para você não precisar correr atrás de cada consulta.",
  },
] as const;

export const HOW_IT_WORKS_STEPS = [
  {
    step: "1",
    title: "Crie sua conta",
    description: "Cadastro em poucos minutos. Teste grátis por 14 dias, sem cartão.",
  },
  {
    step: "2",
    title: "Configure sua agenda",
    description: "Defina horários, serviços e gere seu link de agendamento personalizado.",
  },
  {
    step: "3",
    title: "Compartilhe com pacientes",
    description: "Envie o link no Instagram, WhatsApp ou site. Eles agendam; você recebe tudo organizado.",
  },
] as const;

export const SPECIALTIES = [
  {
    id: "psicologos",
    label: "Psicólogos",
    iconSrc: "/landing-specialty-psicologos.png",
    description:
      "Sessões recorrentes, ficha com anotações clínicas e link para o paciente remarcar sem te interromper.",
  },
  {
    id: "medicos",
    label: "Médicos",
    iconSrc: "/landing-specialty-medicos.png",
    description:
      "Consultas, retornos e encaixes com equipe, serviços e agenda online para cada profissional.",
  },
  {
    id: "nutricionistas",
    label: "Nutricionistas",
    iconSrc: "/landing-specialty-nutricionistas.png",
    description:
      "Acompanhe evolução do paciente com anotações, retornos programados e horários sempre visíveis.",
  },
  {
    id: "dentistas",
    label: "Dentistas",
    iconSrc: "/landing-specialty-dentistas.png",
    description:
      "Procedimentos com duração definida, revisões na agenda e link para o paciente agendar sozinho.",
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
    id: "migracao",
    question: "Preciso migrar minha agenda atual?",
    answer:
      "Não é obrigatório. Muitos profissionais começam configurando os horários disponíveis e compartilhando o link com novos pacientes. Com o tempo, a agenda antiga vai sendo substituída naturalmente.",
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

export const FINAL_CTA = {
  title: "Organize seu consultório esta semana",
  description:
    "Comece o teste grátis hoje. Em poucos minutos sua agenda estará pronta para receber pacientes online.",
  button: "Criar conta grátis",
} as const;
