import { buildClientPwaManifest } from "../../../src/lib/clientPwaManifest";
import { fetchBarbeariaBySlug } from "../../_lib/clientPwaServer";

export default async function handler(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const slug = decodeURIComponent(pathname.split("/").pop() ?? "").trim();

  if (!slug) {
    return new Response(JSON.stringify({ error: "Slug inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = await fetchBarbeariaBySlug(slug);

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
