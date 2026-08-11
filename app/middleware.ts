import {
  CRAWLER_UA_RE,
  PUBLIC_CRAWLER_PAGES,
  PUBLIC_CRAWLER_PATHS,
  patchIndexHtmlForCrawler,
} from "./seo/publicPages";

export const config = {
  matcher: PUBLIC_CRAWLER_PATHS,
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!CRAWLER_UA_RE.test(userAgent)) {
    return undefined;
  }

  const { pathname } = new URL(request.url);
  const page = PUBLIC_CRAWLER_PAGES[pathname];
  if (!page) {
    return undefined;
  }

  const indexUrl = new URL("/index.html", request.url);
  const indexResponse = await fetch(indexUrl.toString());
  if (!indexResponse.ok) {
    return undefined;
  }

  const html = patchIndexHtmlForCrawler(await indexResponse.text(), pathname, page);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
