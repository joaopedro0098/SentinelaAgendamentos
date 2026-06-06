import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildConfirmationOgHtml,
  isLinkPreviewBot,
  type ConfirmationOgPreview,
} from "../../lib/confirmationOgHtml";

type OgPreview = ConfirmationOgPreview & { error?: string };

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
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

  const userAgent = String(req.headers["user-agent"] ?? "");
  const html = buildConfirmationOgHtml(token, preview, {
    redirectBrowsers: !isLinkPreviewBot(userAgent),
  });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  return res.status(200).send(html);
}
