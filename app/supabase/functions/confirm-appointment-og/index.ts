import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE_ORIGIN = (Deno.env.get("APP_URL") ?? "https://www.sentinelagendamentos.com").replace(/\/+$/, "");

type OgPreview = {
  shop_name?: string | null;
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

/** Crawlers de preview (inclui WhatsApp/2.x — distinto do app ao abrir o link no celular). */
function isPreviewCrawler(userAgent: string) {
  return /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|pinterest/i.test(
    userAgent,
  );
}

/** Prévia só texto: sem og:image (WhatsApp não exibe foto/logo no card do link). */
function buildPreviewHtml(token: string, preview: OgPreview) {
  const confirmUrl = `${SITE_ORIGIN}/confirmar-agendamento/${token}`;
  const shopName = preview.shop_name?.trim() || "Agendamento";
  const time = preview.hora ? formatTime(String(preview.hora)) : "";
  const dateLabel = preview.data ? formatDateBr(String(preview.data)) : "";
  const clientName = preview.cliente_nome?.trim() || "Cliente";

  const title = `Confirmar agendamento — ${shopName}`;
  const description =
    dateLabel && time
      ? `${clientName}, confirme seu horário em ${shopName} para ${dateLabel} às ${time}.`
      : `Confirme seu agendamento em ${shopName}.`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(confirmUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="robots" content="noimageindex" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
</head>
<body></body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!token) {
    return new Response("Token inválido", { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") ?? "";
  const confirmUrl = `${SITE_ORIGIN}/confirmar-agendamento/${token}`;

  if (!isPreviewCrawler(userAgent)) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: confirmUrl,
        "Cache-Control": "no-store",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("get_appointment_confirmation_og", {
    p_token: token,
  });

  if (error || !data || typeof data !== "object" || ("error" in data && data.error)) {
    return new Response("Agendamento não encontrado", { status: 404 });
  }

  const html = buildPreviewHtml(token, data as OgPreview);

  return new Response(req.method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
});
