export type ConfirmationOgPreview = {
  shop_name?: string | null;
  shop_logo_url?: string | null;
  cliente_nome?: string | null;
  data?: string | null;
  hora?: string | null;
};

const SITE_ORIGIN = "https://www.sentinelagendamentos.com";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDateBr(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  return date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export function formatTime(hora: string) {
  return String(hora).slice(0, 5);
}

/** URL pública estável para og:image (WhatsApp não carrega render/image do Supabase — 403). */
export function toWhatsAppOgImageUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let absolute = trimmed;
  if (trimmed.startsWith("/")) {
    absolute = `${SITE_ORIGIN}${trimmed}`;
  } else if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(absolute);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return absolute.split("?")[0]?.split("#")[0] ?? null;
  }
}

export function isLinkPreviewBot(userAgent: string) {
  return /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|pinterest/i.test(
    userAgent,
  );
}

export function buildConfirmationOgHtml(
  token: string,
  preview: ConfirmationOgPreview,
  options?: { redirectBrowsers?: boolean },
) {
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
    <meta property="og:image:alt" content="${escapeHtml(shopName)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
    : "";

  const redirectTags =
    options?.redirectBrowsers !== false
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
