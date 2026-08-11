import { PUBLIC_CRAWLER_PAGES } from "../../seo/publicPages";

const HOME_TITLE = "Sentinela Agendamentos — Gestão de agenda para profissionais de saúde";

const crawlerTitles = Object.fromEntries(
  Object.entries(PUBLIC_CRAWLER_PAGES).map(([path, page]) => [path, page.title]),
);

const crawlerDescriptions = Object.fromEntries(
  Object.entries(PUBLIC_CRAWLER_PAGES).map(([path, page]) => [path, page.description]),
);

export const MARKETING_PAGE_TITLES: Record<string, string> = {
  "/": HOME_TITLE,
  ...crawlerTitles,
  "/login": "Entrar — Sentinela Agendamentos",
  "/signup": "Teste grátis 14 dias — Sentinela Agendamentos",
  "/signup/confirmar-codigo": "Confirme seu e-mail — Sentinela Agendamentos",
  "/verificacao-facial": "Verificação facial — Sentinela Agendamentos",
  "/recover": "Recuperar senha — Sentinela Agendamentos",
  "/reset-password": "Recuperação de senha — Sentinela Agendamentos",
  "/reset-password/success": "Senha alterada — Sentinela Agendamentos",
};

export const MARKETING_PAGE_DESCRIPTIONS: Record<string, string> = {
  "/":
    "Agendamento online, ficha de pacientes e gestão do consultório em um só lugar. Teste grátis por 14 dias, sem cartão. Para psicólogos, médicos, nutricionistas e mais.",
  ...crawlerDescriptions,
  "/signup":
    "Crie sua conta e organize sua agenda em minutos. Teste grátis por 14 dias, sem cartão de crédito.",
};

/** Apenas a home deve competir no Google; demais páginas ficam noindex. */
export const NOINDEX_MARKETING_PATHS = new Set(
  Object.keys(MARKETING_PAGE_TITLES).filter((path) => path !== "/"),
);
