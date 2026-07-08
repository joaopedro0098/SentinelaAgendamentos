export const HOME_TITLE = "Sentinela Agendamentos - Teste agora 14 dias grátis!";

export const MARKETING_PAGE_TITLES: Record<string, string> = {
  "/": HOME_TITLE,
  "/planos": "Planos — Sentinela Agendamentos",
  "/login": "Entrar — Sentinela Agendamentos",
  "/signup": "Teste grátis 14 dias — Sentinela Agendamentos",
  "/signup/confirmar-codigo": "Confirme seu e-mail — Sentinela Agendamentos",
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
