import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SITE_ORIGIN = (Deno.env.get("APP_URL") ?? "https://www.sentinelagendamentos.com").replace(/\/+$/, "");

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

function toWhatsAppOgImageUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let absolute = trimmed;
  if (trimmed.startsWith("/")) {
    absolute = `${SITE_ORIGIN}${trimmed}`;
  } else if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(absolute);
    const objectMatch = url.pathname.match(/\/storage\/v1\/object\/public\/(.+)/);
    if (objectMatch) {
      const render = new URL(`${url.origin}/storage/v1/render/image/public/${objectMatch[1]}`);
      render.searchParams.set("width", "512");
      render.searchParams.set("height", "512");
      render.searchParams.set("format", "jpeg");
      render.searchParams.set("quality", "85");
      return render.toString();
    }
  } catch {
    return absolute;
  }

  return absolute;
}

function isLinkPreviewBot(userAgent: string) {
  return /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|pinterest/i.test(
    userAgent,
  );
}

function buildHtml(token: string, preview: OgPreview, userAgent: string) {
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

  const imageUrl = toWhatsAppOgImageUrl(preview.shop_logo_url);
  const imageTags = imageUrl
    ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="512" />
    <meta property="og:image:height" content="512" />
    <meta property="og:image:alt" content="${escapeHtml(shopName)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
    : "";

  const redirectForBrowser = !isLinkPreviewBot(userAgent);
  const redirectTags = redirectForBrowser
    ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(confirmUrl)}" />
    <link rel="canonical" href="${escapeHtml(confirmUrl)}" />
    <script>location.replace(${JSON.stringify(confirmUrl)});</script>`
    : "";

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
  <meta property="og:site_name" content="${escapeHtml(shopName)}" />
  ${imageTags}
  <meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${redirectTags}
</head>
<body><p><a href="${escapeHtml(confirmUrl)}">Continuar para confirmar agendamento</a></p></body>
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

  const preview = data as OgPreview;
  const userAgent = req.headers.get("user-agent") ?? "";
  const html = buildHtml(token, preview, userAgent);

  return new Response(req.method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
});
