import { createClient } from "@supabase/supabase-js";

export function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return { url, key };
}

export async function fetchBarbeariaBySlug(slug: string) {
  const config = getSupabaseConfig();
  if (!config) return { data: null, error: new Error("Supabase não configurado") };

  const supabase = createClient(config.url, config.key);
  return supabase
    .from("barbearias")
    .select("nome, logo_url")
    .eq("slug", slug)
    .eq("ativa", true)
    .maybeSingle();
}

export async function fetchFallbackIcon(origin: string, size: "192" | "512") {
  const response = await fetch(`${origin}/icon-${size}.png`);
  if (!response.ok) return null;
  return response;
}

export async function fetchShopIconResponse(origin: string, logoUrl: string | null, size: "192" | "512") {
  const trimmed = logoUrl?.trim();
  if (trimmed) {
    try {
      const response = await fetch(trimmed);
      if (response.ok && response.body) {
        const contentType = response.headers.get("content-type") ?? "image/png";
        return new Response(response.body, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        });
      }
    } catch {
      // fallback abaixo
    }
  }

  const fallback = await fetchFallbackIcon(origin, size);
  if (!fallback?.ok || !fallback.body) {
    return new Response("Ícone não encontrado", { status: 404 });
  }

  return new Response(fallback.body, {
    status: 200,
    headers: {
      "Content-Type": fallback.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
