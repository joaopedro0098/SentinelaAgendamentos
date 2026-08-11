/** Origem canônica do site em produção. */
export const SITE_ORIGIN = "https://www.sentinelagendamentos.com";

/** Mesmo padrão de user-agent do vercel.json (confirmar-agendamento). */
export const CRAWLER_UA_RE =
  /facebookexternalhit|Facebot|WhatsApp|whatsapp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest/i;

export type PublicCrawlerPage = {
  title: string;
  description: string;
};

/** Rotas públicas com HTML de meta ajustado para crawlers na edge. */
export const PUBLIC_CRAWLER_PAGES: Record<string, PublicCrawlerPage> = {
  "/politica-de-privacidade": {
    title: "Política de privacidade — Sentinela Agendamentos",
    description:
      "Como o Sentinela Agendamentos trata dados pessoais na plataforma de agendamento online para profissionais de saúde.",
  },
  "/termos-de-servico": {
    title: "Termos de serviço — Sentinela Agendamentos",
    description:
      "Termos de uso do Sentinela Agendamentos: condições para utilizar a plataforma de agendamento online.",
  },
  "/exclusao-de-dados-pessoais": {
    title: "Exclusão de dados pessoais — Sentinela Agendamentos",
    description:
      "Como solicitar a exclusão ou alteração dos seus dados pessoais no Sentinela Agendamentos.",
  },
  "/planos": {
    title: "Planos e preços — Sentinela Agendamentos",
    description:
      "Planos Start e Pro para consultórios e clínicas. Teste grátis por 14 dias, sem cartão de crédito. Agendamento online e gestão de equipe.",
  },
};

export const PUBLIC_CRAWLER_PATHS = Object.keys(PUBLIC_CRAWLER_PAGES);

export function buildPublicPageUrl(pathname: string, search = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const base = path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
  return search ? `${base}${search}` : base;
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Reescreve meta tags do index.html para a rota pedida (HTML estático, sem JS). */
export function patchIndexHtmlForCrawler(html: string, pathname: string, page: PublicCrawlerPage): string {
  const url = buildPublicPageUrl(pathname);
  const title = escapeHtmlAttr(page.title);
  const description = escapeHtmlAttr(page.description);

  return html
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`)
    .replace(
      /<meta property="og:description" content="[^"]*"\s*\/>/,
      `<meta property="og:description" content="${description}" />`,
    )
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(
      /<meta name="twitter:description" content="[^"]*"\s*\/>/,
      `<meta name="twitter:description" content="${description}" />`,
    );
}
