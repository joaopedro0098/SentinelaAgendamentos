import { createClient } from "@supabase/supabase-js";
import { buildClientPwaManifest } from "../../../src/lib/clientPwaManifest";

function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return { url, key };
}

export default async function handler(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const slug = decodeURIComponent(pathname.split("/").pop() ?? "").trim();

  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = getSupabaseConfig();
  if (!config) {
    return new Response(JSON.stringify({ error: "Supabase não configurado" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(config.url, config.key);
  const { data, error } = await supabase
    .from("barbearias")
    .select("nome, logo_url")
    .eq("slug", slug)
    .eq("ativa", true)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!data) {
    return new Response(JSON.stringify({ error: "Barbearia não encontrada" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = new URL(request.url).origin;
  const manifest = buildClientPwaManifest(
    {
      slug,
      nome: data.nome?.trim() || "Agendar",
      logoUrl: data.logo_url,
    },
    origin,
  );

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
