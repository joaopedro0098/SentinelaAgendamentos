import {
  getClientPwaManifestUrl,
} from "../../api/_lib/clientPwaManifest";

export {
  buildClientPwaManifest,
  getClientPwaManifestUrl,
  getClientPwaScope,
  getClientPwaStartUrl,
  type ClientPwaShop,
  type WebAppManifest,
} from "../../api/_lib/clientPwaManifest";

export type ClientPwaShopWithLogo = {
  slug: string;
  nome: string;
  logoUrl?: string | null;
};

export function isClientPwaPath(pathname: string) {
  return /^\/agendar\/[^/]+/.test(pathname);
}

export function getClientPwaSlug(pathname: string): string | null {
  const match = pathname.match(/^\/agendar\/([^/]+)/);
  return match?.[1] ?? null;
}

function resolveAppleTouchIcon(logoUrl: string | null | undefined) {
  const value = logoUrl?.trim();
  if (value && /^https?:\/\//i.test(value)) return value;
  return "/apple-touch-icon.png?v=20260602";
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

export function applyClientPwaHead(shop: ClientPwaShopWithLogo) {
  const manifestLink = getOrCreateLink("manifest");
  const previousManifestHref = manifestLink.getAttribute("href");
  manifestLink.href = getClientPwaManifestUrl(shop.slug);

  const appleTitle = getOrCreateMeta("apple-mobile-web-app-title");
  const previousAppleTitle = appleTitle.content;
  appleTitle.content = shop.nome.trim() || "Agendar";

  const appleIcon = getOrCreateLink("apple-touch-icon");
  const previousAppleIconHref = appleIcon.getAttribute("href");
  appleIcon.href = resolveAppleTouchIcon(shop.logoUrl);

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
