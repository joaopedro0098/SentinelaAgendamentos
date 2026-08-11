/** Origem canônica do site em produção (usada em og:url e canonical). */
export const SITE_ORIGIN = "https://www.sentinelagendamentos.com";

/** Monta a URL pública absoluta da rota atual. */
export function buildPublicPageUrl(pathname: string, search = ""): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const base = path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
  return search ? `${base}${search}` : base;
}

function setMetaProperty(property: string, content: string) {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonicalLink(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Atualiza og:url e canonical para refletir a rota atual. */
export function syncDocumentUrlMeta(pathname: string, search = "") {
  const url = buildPublicPageUrl(pathname, search);
  setMetaProperty("og:url", url);
  setCanonicalLink(url);
}
