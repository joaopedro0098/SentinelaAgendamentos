export type ClientPwaShop = {
  slug: string;
  nome: string;
  logoUrl?: string | null;
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

export function getClientPwaScope(slug: string) {
  return `/agendar/${slug}`;
}

export function getClientPwaStartUrl(slug: string) {
  return `${getClientPwaScope(slug)}?source=client-pwa`;
}

export function getClientPwaManifestUrl(slug: string) {
  return `/api/manifest/agendar/${encodeURIComponent(slug)}`;
}

export function getClientPwaIconUrl(slug: string, size: 192 | 512) {
  return `/api/pwa-icon/agendar/${encodeURIComponent(slug)}/${size}`;
}

export function isClientPwaPath(pathname: string) {
  return /^\/agendar\/[^/]+/.test(pathname);
}

export function getClientPwaSlug(pathname: string): string | null {
  const match = pathname.match(/^\/agendar\/([^/]+)/);
  return match?.[1] ?? null;
}

function truncateShortName(nome: string) {
  const trimmed = nome.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11)}…`;
}

function buildManifestIcons(slug: string) {
  const icon192 = getClientPwaIconUrl(slug, 192);
  const icon512 = getClientPwaIconUrl(slug, 512);

  return [
    { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

export function buildClientPwaManifest(shop: ClientPwaShop, _origin?: string): WebAppManifest {
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
    icons: buildManifestIcons(shop.slug),
  };
}

function getOrCreateLink(rel: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function getOrCreateMeta(name: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  return meta;
}

export function applyClientPwaHead(shop: ClientPwaShop) {
  const manifestLink = getOrCreateLink("manifest");
  const previousManifestHref = manifestLink.getAttribute("href");
  manifestLink.href = getClientPwaManifestUrl(shop.slug);

  const appleTitle = getOrCreateMeta("apple-mobile-web-app-title");
  const previousAppleTitle = appleTitle.content;
  appleTitle.content = shop.nome.trim() || "Agendar";

  const appleIcon = getOrCreateLink("apple-touch-icon");
  const previousAppleIconHref = appleIcon.getAttribute("href");
  appleIcon.href = getClientPwaIconUrl(shop.slug, 192);

  return () => {
    manifestLink.href = previousManifestHref ?? "/manifest.webmanifest";
    appleTitle.content = previousAppleTitle;
    if (previousAppleIconHref) {
      appleIcon.href = previousAppleIconHref;
    } else {
      appleIcon.href = "/apple-touch-icon.png?v=20260602";
    }
  };
}
