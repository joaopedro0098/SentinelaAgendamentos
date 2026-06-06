import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const STATIC_ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

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
    icons: STATIC_ICONS,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();

  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let nome = "Agendar";

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await supabase
      .from("barbearias")
      .select("nome")
      .eq("slug", slug)
      .eq("ativa", true)
      .maybeSingle();

    if (data?.nome?.trim()) {
      nome = data.nome.trim();
    }
  } catch {
    // fallback: manifest genérico ainda é instalável
  }

  const manifest = buildManifest(slug, nome);

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
});
