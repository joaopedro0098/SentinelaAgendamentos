import { PUBLIC_CRAWLER_PAGES } from "../../seo/publicPages";
import { NICHE_LANDING_REGISTRY } from "@/features/landing/content/niche/index";

const HOME_TITLE = "Sentinela Agendamentos — Gestão de agenda para profissionais de saúde";

const crawlerTitles = Object.fromEntries(
  Object.entries(PUBLIC_CRAWLER_PAGES).map(([path, page]) => [path, page.title]),
);

const crawlerDescriptions = Object.fromEntries(
  Object.entries(PUBLIC_CRAWLER_PAGES).map(([path, page]) => [path, page.description]),
);

const nicheTitles = Object.fromEntries(
  NICHE_LANDING_REGISTRY.map((config) => [config.path, config.seo.title]),
);

const nicheDescriptions = Object.fromEntries(
  NICHE_LANDING_REGISTRY.map((config) => [config.path, config.seo.description]),
);

export const MARKETING_PAGE_TITLES: Record<string, string> = {
  "/": HOME_TITLE,
  ...crawlerTitles,
  ...nicheTitles,
  "/login": "Entrar — Sentinela Agendamentos",
  "/signup": "Teste grátis 14 dias — Sentinela Agendamentos",
  "/cadastro": "Teste grátis 14 dias — Sentinela Agendamentos",
  "/signup/confirmar-codigo": "Confirme seu e-mail — Sentinela Agendamentos",
  "/verificacao-facial": "Verificação facial — Sentinela Agendamentos",
  "/recover": "Recuperar senha — Sentinela Agendamentos",
  "/reset-password": "Recuperação de senha — Sentinela Agendamentos",
  "/reset-password/success": "Senha alterada — Sentinela Agendamentos",
};

export const MARKETING_PAGE_DESCRIPTIONS: Record<string, string> = {
  "/":
    "Agendamento online, ficha de pacientes e gestão do consultório em um só lugar. Teste grátis por 14 dias, sem cartão. Para profissionais de saúde e bem-estar.",
  ...crawlerDescriptions,
  ...nicheDescriptions,
  "/signup":
    "Crie sua conta e organize sua agenda em minutos. Teste grátis por 14 dias, sem cartão de crédito.",
  "/cadastro":
    "Crie sua conta e organize sua agenda em minutos. Teste grátis por 14 dias, sem cartão de crédito.",
};

/** Home + landings nichadas indexáveis; demais marketing pages noindex. */
export const INDEXABLE_MARKETING_PATHS = new Set<string>([
  "/",
  ...NICHE_LANDING_REGISTRY.map((c) => c.path),
]);

export const NOINDEX_MARKETING_PATHS = new Set(
  Object.keys(MARKETING_PAGE_TITLES).filter((path) => !INDEXABLE_MARKETING_PATHS.has(path)),
);
