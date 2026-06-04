export const HOME_TITLE = "Sentinela Agendamentos - Teste agora 14 dias grátis!";

export const HOME_DESCRIPTION =
  "Link de agendamento fácil para quem marca horário; painel simples para quem gerencia equipe, serviços e agenda.";

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
