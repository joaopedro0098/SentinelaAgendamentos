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

function resolveIconUrl(iconUrl: string | null | undefined, origin?: string) {
  const value = iconUrl?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && origin) return `${origin}${value}`;
  return value;
}

function buildManifestIcons(logoUrl: string | null | undefined, origin?: string) {
  const resolvedLogo = resolveIconUrl(logoUrl, origin);
  if (resolvedLogo) {
    return [
      { src: resolvedLogo, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: resolvedLogo, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: resolvedLogo, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ];
  }

  return [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

export function buildClientPwaManifest(shop: ClientPwaShop, origin?: string): WebAppManifest {
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
    background_color: DEFAULT_BACKGROUND_COLOR,
    theme_color: DEFAULT_THEME_COLOR,
    icons: buildManifestIcons(shop.logoUrl, origin),
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
  const useApiManifest = import.meta.env.PROD;
  let blobUrl: string | null = null;

  if (useApiManifest) {
    manifestLink.href = getClientPwaManifestUrl(shop.slug);
  } else {
    blobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(buildClientPwaManifest(shop))], {
        type: "application/manifest+json",
      }),
    );
    manifestLink.href = blobUrl;
  }

  const appleTitle = getOrCreateMeta("apple-mobile-web-app-title");
  const previousAppleTitle = appleTitle.content;
  appleTitle.content = shop.nome.trim() || "Agendar";

  const appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  const previousAppleIconHref = appleIcon?.getAttribute("href") ?? null;
  const resolvedLogo = resolveIconUrl(shop.logoUrl);
  if (appleIcon && resolvedLogo) {
    appleIcon.href = resolvedLogo;
  }

  return () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    manifestLink.href = previousManifestHref ?? "/manifest.webmanifest";
    appleTitle.content = previousAppleTitle;
    if (appleIcon && previousAppleIconHref) {
      appleIcon.href = previousAppleIconHref;
    }
  };
}
