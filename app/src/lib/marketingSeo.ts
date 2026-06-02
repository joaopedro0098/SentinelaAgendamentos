export const HOME_TITLE = "Sentinela Agendamentos - Teste agora 14 dias grátis!";

export const HOME_DESCRIPTION =
  "Teste grátis por 14 dias! Sistema de agendamento online para barbearias com link para clientes, colaboradores, serviços e horários.";

/** Cache-bust de favicons/logo após troca de marca. */
export const BRAND_ASSET_VERSION = "20260602";

export const MARKETING_PAGE_TITLES: Record<string, string> = {
  "/": HOME_TITLE,
  "/planos": "Planos — Sentinela Agendamentos",
  "/login": "Entrar — Sentinela Agendamentos",
  "/signup": "Teste grátis 14 dias — Sentinela Agendamentos",
  "/signup/verify-email": "Verifique seu email e spam — Sentinela Agendamentos",
  "/recover": "Recuperar senha — Sentinela Agendamentos",
  "/reset-password": "Recuperação de senha — Sentinela Agendamentos",
  "/reset-password/success": "Senha alterada — Sentinela Agendamentos",
  "/politica-de-privacidade": "Política de privacidade — Sentinela Agendamentos",
  "/termos-de-servico": "Termos de serviço — Sentinela Agendamentos",
};

/** Apenas a home deve competir no Google; demais páginas ficam noindex. */
export const NOINDEX_MARKETING_PATHS = new Set(
  Object.keys(MARKETING_PAGE_TITLES).filter((path) => path !== "/"),
);
