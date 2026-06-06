import { fetchBarbeariaBySlug, fetchShopIconResponse } from "../../../_lib/clientPwaServer";

const VALID_SIZES = new Set(["192", "512"]);

export default async function handler(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  const sizeRaw = segments.pop() ?? "";
  const slug = decodeURIComponent(segments.pop() ?? "").trim();

  if (!slug || !VALID_SIZES.has(sizeRaw)) {
    return new Response("Parâmetros inválidos", { status: 400 });
  }

  const size = sizeRaw as "192" | "512";
  const { data, error } = await fetchBarbeariaBySlug(slug);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  if (!data) {
    return new Response("Barbearia não encontrada", { status: 404 });
  }

  const origin = new URL(request.url).origin;
  return fetchShopIconResponse(origin, data.logo_url, size);
}
