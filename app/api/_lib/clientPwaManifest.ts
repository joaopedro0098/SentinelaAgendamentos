export type ClientPwaShop = {
  slug: string;
  nome: string;
};

export type WebAppManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  display_override: string[];
  handle_links: string;
  background_color: string;
  theme_color: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose: string;
  }>;
};

const DEFAULT_THEME_COLOR = "#2fa66a";
const DEFAULT_BACKGROUND_COLOR = "#fafafa";

const STATIC_MANIFEST_ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

export function getClientPwaScope(slug: string) {
  return `/agendar/${slug}`;
}

export function getClientPwaStartUrl(slug: string) {
  return `${getClientPwaScope(slug)}?source=client-pwa`;
}

export function getClientPwaManifestUrl(slug: string) {
  return `/manifest/agendar/${encodeURIComponent(slug)}.webmanifest`;
}

function truncateShortName(nome: string) {
  const trimmed = nome.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11)}…`;
}

export function buildClientPwaManifest(shop: ClientPwaShop): WebAppManifest {
  const nome = shop.nome.trim() || "Agendar";
  const startUrl = getClientPwaStartUrl(shop.slug);

  return {
    id: startUrl,
    name: nome,
    short_name: truncateShortName(nome),
    description: `Agende horário com ${nome}`,
    lang: "pt-BR",
    start_url: startUrl,
    scope: getClientPwaScope(shop.slug),
    display: "standalone",
    display_override: ["standalone", "fullscreen"],
    handle_links: "preferred",
    background_color: DEFAULT_BACKGROUND_COLOR,
    theme_color: DEFAULT_THEME_COLOR,
    icons: STATIC_MANIFEST_ICONS.map((icon) => ({ ...icon })),
  };
}
