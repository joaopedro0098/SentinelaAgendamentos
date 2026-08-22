/**
 * Cliente mínimo para WhatsApp via Infobip.
 *
 * Secrets no painel Supabase:
 *   INFOBIP_BASE_URL          (ex.: https://xxxxx.api.infobip.com)
 *   INFOBIP_API_KEY           (Authorization: App {key})
 *   INFOBIP_WHATSAPP_SENDER   (E.164 dígitos, ex.: 5511999999999)
 *   INFOBIP_TEMPLATE_REMINDER / INFOBIP_TEMPLATE_LEMBRETE_3H / INFOBIP_TEMPLATE_PROFESSIONAL_ALERT
 */

import { normalizeBrazilPhoneE164Digits } from "./twilioWhatsapp.ts";

export type InfobipSendCredentials = {
  apiKey: string;
  baseUrl: string;
  sender: string;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeApiKeyHeader(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.startsWith("App ") ? trimmed : `App ${trimmed}`;
}

export function getInfobipCredentials(override?: Partial<InfobipSendCredentials>): InfobipSendCredentials {
  const apiKey = override?.apiKey ?? Deno.env.get("INFOBIP_API_KEY")?.trim();
  const baseUrl = override?.baseUrl ?? Deno.env.get("INFOBIP_BASE_URL")?.trim();
  const sender = override?.sender ?? Deno.env.get("INFOBIP_WHATSAPP_SENDER")?.trim();
  if (!apiKey || !baseUrl || !sender) {
    throw new Error("Infobip não configurado (INFOBIP_API_KEY / INFOBIP_BASE_URL / INFOBIP_WHATSAPP_SENDER).");
  }
  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl), sender: digitsOnly(sender) };
}

export type InfobipSendResult = {
  messageId: string;
  status: string;
};

type InfobipMessageResponse = {
  messageId?: string;
  status?: { groupName?: string; name?: string };
  messages?: Array<{
    messageId?: string;
    status?: { groupName?: string; name?: string };
  }>;
};

function parseInfobipSendResponse(data: InfobipMessageResponse | null): InfobipSendResult {
  const first = data?.messages?.[0];
  const messageId = (first?.messageId ?? data?.messageId ?? "").trim();
  if (!messageId) {
    throw new Error("Infobip respondeu sem messageId.");
  }
  const status =
    first?.status?.name ??
    first?.status?.groupName ??
    data?.status?.name ??
    data?.status?.groupName ??
    "UNKNOWN";
  return { messageId, status };
}

async function infobipPost(
  credentials: InfobipSendCredentials,
  path: string,
  body: Record<string, unknown>,
): Promise<InfobipSendResult> {
  const res = await fetch(`${credentials.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: normalizeApiKeyHeader(credentials.apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null) as InfobipMessageResponse | { requestError?: { serviceException?: { text?: string } } } | null;
  if (!res.ok) {
    const errText =
      (data as { requestError?: { serviceException?: { text?: string } } })?.requestError?.serviceException?.text ??
      `Infobip respondeu ${res.status}`;
    throw new Error(errText);
  }

  return parseInfobipSendResponse(data as InfobipMessageResponse);
}

function toInfobipRecipient(to: string): string {
  return normalizeBrazilPhoneE164Digits(to);
}

/**
 * Envia template WhatsApp conforme doc oficial Infobip:
 * POST {baseUrl}/whatsapp/1/message/template
 */
export async function sendWhatsAppTemplateInfobip(params: {
  to: string;
  templateName: string;
  placeholders?: string[];
  language?: string;
  messageId?: string;
  callbackData?: string;
  credentials?: InfobipSendCredentials;
}): Promise<InfobipSendResult> {
  const credentials = getInfobipCredentials(params.credentials);
  const placeholders = params.placeholders ?? [];

  return infobipPost(credentials, "/whatsapp/1/message/template", {
    messages: [
      {
        from: credentials.sender,
        to: toInfobipRecipient(params.to),
        ...(params.messageId ? { messageId: params.messageId } : {}),
        content: {
          templateName: params.templateName,
          templateData: {
            body: { placeholders },
          },
          language: params.language ?? "pt_BR",
        },
        ...(params.callbackData ? { callbackData: params.callbackData } : {}),
      },
    ],
  });
}

/**
 * Mensagem de sessão (texto livre) — janela 24h.
 * POST {baseUrl}/whatsapp/1/message/text
 */
export async function sendWhatsAppSessionText(params: {
  to: string;
  text: string;
  messageId?: string;
  callbackData?: string;
  credentials?: InfobipSendCredentials;
}): Promise<InfobipSendResult> {
  const credentials = getInfobipCredentials(params.credentials);

  return infobipPost(credentials, "/whatsapp/1/message/text", {
    from: credentials.sender,
    to: toInfobipRecipient(params.to),
    ...(params.messageId ? { messageId: params.messageId } : {}),
    content: { text: params.text },
    ...(params.callbackData ? { callbackData: params.callbackData } : {}),
  });
}

export type InfobipInteractiveButton = {
  id: string;
  title: string;
};

/**
 * Mensagem de sessão com botões interativos (quick reply).
 * POST {baseUrl}/whatsapp/1/message/interactive/buttons
 */
export async function sendWhatsAppInteractiveButtons(params: {
  to: string;
  bodyText: string;
  buttons: InfobipInteractiveButton[];
  messageId?: string;
  callbackData?: string;
  credentials?: InfobipSendCredentials;
}): Promise<InfobipSendResult> {
  const credentials = getInfobipCredentials(params.credentials);

  if (params.buttons.length < 1 || params.buttons.length > 3) {
    throw new Error("Infobip interactive buttons exige entre 1 e 3 botões.");
  }

  return infobipPost(credentials, "/whatsapp/1/message/interactive/buttons", {
    from: credentials.sender,
    to: toInfobipRecipient(params.to),
    ...(params.messageId ? { messageId: params.messageId } : {}),
    content: {
      body: { text: params.bodyText },
      action: {
        buttons: params.buttons.map((button) => ({
          type: "REPLY",
          id: button.id,
          title: button.title,
        })),
      },
    },
    ...(params.callbackData ? { callbackData: params.callbackData } : {}),
  });
}
