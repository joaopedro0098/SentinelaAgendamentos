import { fetchClientPwaShop, fetchShopLogoResponse } from "../_shared/clientPwa.ts";

const VALID_SIZES = new Set(["192", "512"]);

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Método não permitido", { status: 405 });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const sizeRaw = url.searchParams.get("size") ?? "";

  if (!slug || !VALID_SIZES.has(sizeRaw)) {
    return new Response("Parâmetros inválidos", { status: 400 });
  }

  const size = Number(sizeRaw) as 192 | 512;

  try {
    const shop = await fetchClientPwaShop(slug);
    return fetchShopLogoResponse(shop?.logo_url, size);
  } catch {
    return fetchShopLogoResponse(null, size);
  }
});
