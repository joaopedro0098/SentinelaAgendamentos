import {
  buildClientPwaManifestIcons,
  fetchClientPwaShop,
} from "../_shared/clientPwa.ts";

function truncateShortName(nome: string) {
  const trimmed = nome.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 11)}…`;
}

function buildManifest(slug: string, nome: string) {
  const startUrl = `/agendar/${slug}?source=client-pwa`;
  return {
    id: startUrl,
    name: nome,
    short_name: truncateShortName(nome),
    description: `Agende horário com ${nome}`,
    lang: "pt-BR",
    start_url: startUrl,
    scope: `/agendar/${slug}`,
    display: "standalone",
    display_override: ["standalone", "fullscreen"],
    handle_links: "preferred",
    background_color: "#fafafa",
    theme_color: "#2fa66a",
    icons: buildClientPwaManifestIcons(slug),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim();
  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let nome = "Agendar";
  try {
    const shop = await fetchClientPwaShop(slug);
    if (shop?.nome?.trim()) nome = shop.nome.trim();
  } catch {
    // manifest genérico ainda é instalável
  }

  return new Response(JSON.stringify(buildManifest(slug, nome)), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
});
