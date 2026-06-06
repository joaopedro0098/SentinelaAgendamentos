import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildClientPwaManifest } from "../../_lib/clientPwaManifest";
import { fetchBarbeariaBySlug } from "../../_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = decodeURIComponent(String(req.query.slug ?? "")).trim();

  if (!slug) {
    res.status(400).json({ error: "Slug inválido" });
    return;
  }

  const { data, error } = await fetchBarbeariaBySlug(slug);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Barbearia não encontrada" });
    return;
  }

  const manifest = buildClientPwaManifest({
    slug,
    nome: data.nome?.trim() || "Agendar",
  });

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.status(200).send(JSON.stringify(manifest));
}
