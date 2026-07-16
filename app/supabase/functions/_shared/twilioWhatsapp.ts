/**
 * Cliente mínimo para a API de WhatsApp da Twilio (Content Templates).
 *
 * Requer os secrets no painel Supabase:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM        (ex.: whatsapp:+551199999999 — número aprovado na Twilio)
 *   TWILIO_CONTENT_SID_REMINDER            (Content Template do lembrete D-1, com os 3 quick reply buttons)
 *   TWILIO_CONTENT_SID_PROFESSIONAL_ALERT  (Content Template do alerta ao profissional)
 */

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/**
 * E.164 em dígitos para telefones brasileiros salvos sem DDI (10–11 dígitos: DDD + número).
 * Se já vier com 55 (12+ dígitos), mantém. Não infere outros países — não prefixa +1.
 */
export function normalizeBrazilPhoneE164Digits(phone: string): string {
  let digits = digitsOnly(phone);
  if (digits.startsWith("0") && digits.length > 11) {
    digits = digits.replace(/^0+/, "");
  }
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

/** Normaliza para "whatsapp:+<dígitos E.164 BR quando aplicável>". */
export function toWhatsAppAddress(phone: string): string {
  const digits = normalizeBrazilPhoneE164Digits(phone);
  return `whatsapp:+${digits}`;
}

/** Extrai só os dígitos do telefone, removendo o prefixo "whatsapp:" e qualquer não-dígito. */
export function phoneDigitsFromWhatsAppAddress(value: string): string {
  return digitsOnly(value);
}

function getTwilioCredentials() {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM")?.trim();
  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio não configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM).");
  }
  return { accountSid, authToken, from };
}

export type SendTemplateResult = {
  sid: string;
  status: string;
};

/**
 * Envia uma mensagem de template (Content API) via Twilio.
 * `contentSid` é o ID do template aprovado no Twilio Console (Content Template Builder).
 * `contentVariables` mapeia as variáveis nomeadas do template (ex.: {"1": "João", "2": "14/07 às 15:00"}).
 */
export async function sendWhatsAppTemplate(params: {
  to: string;
  contentSid: string;
  contentVariables?: Record<string, string>;
}): Promise<SendTemplateResult> {
  const { accountSid, authToken, from } = getTwilioCredentials();

  const body = new URLSearchParams({
    From: from,
    To: toWhatsAppAddress(params.to),
    ContentSid: params.contentSid,
  });
  if (params.contentVariables) {
    body.set("ContentVariables", JSON.stringify(params.contentVariables));
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || `Twilio respondeu ${res.status}`;
    throw new Error(message);
  }

  return { sid: data.sid as string, status: data.status as string };
}

/**
 * Valida a assinatura X-Twilio-Signature de um webhook (mesmo princípio do
 * stripe-subscription-webhook, mas com o algoritmo HMAC-SHA1 exigido pela Twilio).
 * Ver: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export async function verifyTwilioSignature(params: {
  signatureHeader: string | null;
  webhookUrl: string;
  formParams: Record<string, string>;
}): Promise<boolean> {
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  if (!authToken || !params.signatureHeader) return false;

  const sortedKeys = Object.keys(params.formParams).sort();
  let data = params.webhookUrl;
  for (const key of sortedKeys) {
    data += key + params.formParams[key];
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  return computed === params.signatureHeader;
}
