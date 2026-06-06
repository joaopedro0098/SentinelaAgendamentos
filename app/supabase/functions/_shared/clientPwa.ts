import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const CLIENT_PWA_SITE_ORIGIN = (
  Deno.env.get("APP_URL") ?? "https://www.sentinelagendamentos.com"
).replace(/\/+$/, "");

export type ClientPwaShopRow = {
  nome: string | null;
  logo_url: string | null;
};

export function getClientPwaIconPath(slug: string, size: 192 | 512) {
  return `/manifest/agendar/${encodeURIComponent(slug)}/icon-${size}.png`;
}

export function buildClientPwaManifestIcons(slug: string) {
  const icon192 = getClientPwaIconPath(slug, 192);
  const icon512 = getClientPwaIconPath(slug, 512);

  return [
    { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

export async function fetchClientPwaShop(slug: string): Promise<ClientPwaShopRow | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data } = await supabase
    .from("barbearias")
    .select("nome, logo_url")
    .eq("slug", slug)
    .eq("ativa", true)
    .maybeSingle();

  return data;
}

export async function fetchSentinelaFallbackIcon(size: 192 | 512) {
  return fetch(`${CLIENT_PWA_SITE_ORIGIN}/icon-${size}.png`);
}

export async function fetchShopLogoResponse(logoUrl: string | null | undefined, size: 192 | 512) {
  const trimmed = logoUrl?.trim();
  if (trimmed) {
    try {
      const response = await fetch(trimmed);
      if (response.ok && response.body) {
        return new Response(response.body, {
          status: 200,
          headers: {
            "Content-Type": response.headers.get("content-type") ?? "image/png",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          },
        });
      }
    } catch {
      // fallback abaixo
    }
  }

  const fallback = await fetchSentinelaFallbackIcon(size);
  if (!fallback.ok || !fallback.body) {
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
