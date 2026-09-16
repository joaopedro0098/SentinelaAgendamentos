/**
 * Cliente Cloud API Meta: POST /{phone_number_id}/messages (template).
 * Retry em limites de throughput (130429, 131056); 131048 sem retry.
 */
import type { MetaGraphErrorBody } from "./metaMessageTemplates.ts";

const DEFAULT_API_VERSION = "v21.0";
const RETRYABLE_META_CODES = new Set([130429, 131056]);
const QUALITY_LIMIT_META_CODE = 131048;

export class MetaWhatsappSendError extends Error {
  status: number;
  metaCode?: number;
  readonly qualityLimited: boolean;
  readonly retryable: boolean;

  constructor(message: string, opts: { status: number; metaCode?: number; qualityLimited?: boolean; retryable?: boolean }) {
    super(message);
    this.name = "MetaWhatsappSendError";
    this.status = opts.status;
    this.metaCode = opts.metaCode;
    this.qualityLimited = opts.qualityLimited === true;
    this.retryable = opts.retryable === true;
  }
}

function graphApiVersion(): string {
  return Deno.env.get("META_GRAPH_API_VERSION")?.trim() || DEFAULT_API_VERSION;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maxSendAttempts(): number {
  const raw = Number(Deno.env.get("META_WHATSAPP_SEND_MAX_RETRIES") ?? "5");
  if (!Number.isFinite(raw) || raw < 1) return 5;
  return Math.floor(raw);
}

function backoffBaseMs(): number {
  const raw = Number(Deno.env.get("META_WHATSAPP_SEND_BACKOFF_BASE_MS") ?? "1000");
  if (!Number.isFinite(raw) || raw < 100) return 1000;
  return Math.floor(raw);
}

function computeBackoffMs(attemptIndex: number): number {
  const base = backoffBaseMs();
  const exp = base * 2 ** attemptIndex;
  const jitter = Math.floor(Math.random() * Math.min(500, base));
  return exp + jitter;
}

function errorFromResponse(status: number, body: MetaGraphErrorBody): MetaWhatsappSendError {
  const metaCode = body.error?.code;
  const message = body.error?.error_user_msg ?? body.error?.message ?? `Meta respondeu ${status}`;

  if (metaCode === QUALITY_LIMIT_META_CODE) {
    return new MetaWhatsappSendError(message, {
      status,
      metaCode,
      qualityLimited: true,
      retryable: false,
    });
  }

  if (metaCode != null && RETRYABLE_META_CODES.has(metaCode)) {
    return new MetaWhatsappSendError(message, {
      status,
      metaCode,
      qualityLimited: false,
      retryable: true,
    });
  }

  return new MetaWhatsappSendError(message, {
    status,
    metaCode,
    qualityLimited: false,
    retryable: false,
  });
}

export type SendMetaTemplateMessageParams = {
  phoneNumberId: string;
  accessToken: string;
  toE164Digits: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
};

export type SendMetaTemplateMessageResult = {
  messageId: string;
};

async function postTemplateMessageOnce(
  params: SendMetaTemplateMessageParams,
): Promise<SendMetaTemplateMessageResult> {
  const url = `https://graph.facebook.com/${graphApiVersion()}/${params.phoneNumberId}/messages`;

  const templatePayload: Record<string, unknown> = {
    name: params.templateName,
    language: { code: params.languageCode },
  };

  if (params.bodyParameters.length > 0) {
    templatePayload.components = [
      {
        type: "body",
        parameters: params.bodyParameters.map((text) => ({
          type: "text",
          text,
        })),
      },
    ];
  }

  const payload = {
    messaging_product: "whatsapp",
    to: params.toE164Digits.replace(/\D/g, ""),
    type: "template",
    template: templatePayload,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
  } & MetaGraphErrorBody;

  if (!res.ok) {
    throw errorFromResponse(res.status, data);
  }

  const messageId = data.messages?.[0]?.id;
  if (!messageId) {
    throw new MetaWhatsappSendError("Meta não retornou message id.", { status: res.status, retryable: false });
  }

  return { messageId };
}

/** Envia template com retry/backoff para códigos 130429 e 131056. */
export async function sendMetaWhatsAppTemplateMessage(
  params: SendMetaTemplateMessageParams,
): Promise<SendMetaTemplateMessageResult> {
  const attempts = maxSendAttempts();
  let lastError: MetaWhatsappSendError | undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await postTemplateMessageOnce(params);
    } catch (e) {
      if (!(e instanceof MetaWhatsappSendError)) {
        throw e;
      }
      lastError = e;

      if (e.qualityLimited) {
        console.error(
          `[metaWhatsapp] limite de qualidade/spam (131048) phone_number_id=${params.phoneNumberId} to=${params.toE164Digits}: ${e.message}`,
        );
        throw e;
      }

      if (e.retryable && attempt < attempts - 1) {
        const waitMs = computeBackoffMs(attempt);
        console.warn(
          `[metaWhatsapp] rate limit metaCode=${e.metaCode} tentativa ${attempt + 1}/${attempts}, aguardando ${waitMs}ms`,
        );
        await sleep(waitMs);
        continue;
      }

      throw e;
    }
  }

  throw lastError ?? new MetaWhatsappSendError("Falha ao enviar template Meta.", { status: 500, retryable: false });
}
