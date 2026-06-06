import type { VercelRequest, VercelResponse } from "@vercel/node";

const SITE_ORIGIN = (process.env.APP_URL ?? "https://www.sentinelagendamentos.com").replace(/\/+$/, "");

type OgPreview = {
  shop_name?: string | null;
  shop_logo_url?: string | null;
  cliente_nome?: string | null;
  data?: string | null;
  hora?: string | null;
  error?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateBr(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(hora: string) {
  return String(hora).slice(0, 5);
}

function absoluteImageUrl(raw: string | null | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${SITE_ORIGIN}${trimmed}`;
  return trimmed;
}

async function fetchOgPreview(token: string): Promise<OgPreview | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_appointment_confirmation_og`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ p_token: token }),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as OgPreview;
  if (data.error) return null;
  return data;
}

function buildOgHtml(token: string, preview: OgPreview) {
  const pageUrl = `${SITE_ORIGIN}/confirmar-agendamento/${token}`;
  const shopName = preview.shop_name?.trim() || "Agendamento";
  const time = preview.hora ? formatTime(String(preview.hora)) : "";
  const dateLabel = preview.data ? formatDateBr(String(preview.data)) : "";
  const clientName = preview.cliente_nome?.trim() || "Cliente";

  const title = `Confirmar agendamento — ${shopName}`;
  const description =
    dateLabel && time
      ? `${clientName}, confirme seu horário em ${shopName} para ${dateLabel} às ${time}.`
      : `Confirme seu agendamento em ${shopName}.`;

  const imageUrl = absoluteImageUrl(preview.shop_logo_url);
  const imageTags = imageUrl
    ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(shopName)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:site_name" content="${escapeHtml(shopName)}" />
  ${imageTags}
  <meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
</head>
<body></body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  const token = String(req.query.token ?? "").trim();
  if (!token) {
    return res.status(400).send("Token inválido");
  }

  const preview = await fetchOgPreview(token);
  if (!preview) {
    return res.status(404).send("Agendamento não encontrado");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  return res.status(200).send(buildOgHtml(token, preview));
}
