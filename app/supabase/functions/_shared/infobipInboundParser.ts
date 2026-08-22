/**
 * Parser defensivo para webhooks inbound Infobip.
 *
 * Formato confirmado (doc oficial):
 * {
 *   "results": [{
 *     "from": "...", "to": "...", "messageId": "...",
 *     "receivedAt": "...",
 *     "message": {
 *       "type": "TEXT" | "INTERACTIVE_BUTTON_REPLY" | ...,
 *       "text": "...",
 *       "id": "...",     // INTERACTIVE_BUTTON_REPLY — ID do botão
 *       "title": "..."   // INTERACTIVE_BUTTON_REPLY — label
 *     }
 *   }],
 *   "messageCount": 1
 * }
 *
 * A CONFIRMAR: clique em botão de TEMPLATE aprovado (Quick Reply/HSM) pode chegar
 * com campo "payload" em vez de "id"/"title". Aceitamos ambos e logamos desconhecidos.
 */

import { phoneDigitsFromWhatsAppAddress } from "./twilioWhatsapp.ts";

export type InfobipInboundMessage = {
  type?: string;
  text?: string;
  id?: string;
  title?: string;
  /** A CONFIRMAR: possível formato para clique em template Quick Reply. */
  payload?: string;
};

export type InfobipInboundResult = {
  from?: string;
  to?: string;
  messageId?: string;
  receivedAt?: string;
  message?: InfobipInboundMessage;
  /** Delivery/seen reports incluem status em vez de message. */
  status?: { groupName?: string; name?: string };
};

export type InfobipWebhookPayload = {
  results?: InfobipInboundResult[];
  messageCount?: number;
};

export type ParsedInfobipInbound = {
  messageId: string;
  telefoneDigits: string;
  body: string;
  buttonPayload: string;
};

function extractButtonPayload(message: InfobipInboundMessage): { payload: string; source: string } | null {
  const type = (message.type ?? "").toUpperCase();

  if (type === "INTERACTIVE_BUTTON_REPLY" || type === "BUTTON") {
    if (message.id?.trim()) {
      return { payload: message.id.trim(), source: "message.id" };
    }
    // A CONFIRMAR: fallback para template Quick Reply
    if (message.payload?.trim()) {
      console.info(
        "infobipInboundParser: button payload via message.payload (A CONFIRMAR — formato template Quick Reply).",
      );
      return { payload: message.payload.trim(), source: "message.payload" };
    }
    if (message.title?.trim()) {
      console.warn(
        "infobipInboundParser: INTERACTIVE_BUTTON_REPLY sem id/payload — usando title como fallback.",
        JSON.stringify({ title: message.title }),
      );
      return { payload: message.title.trim(), source: "message.title" };
    }
    console.error(
      "infobipInboundParser: clique de botão sem formato conhecido (A CONFIRMAR template Quick Reply).",
      JSON.stringify(message),
    );
    return null;
  }

  // A CONFIRMAR: alguns eventos de template podem vir com type diferente mas com payload
  if (message.payload?.trim()) {
    console.info(
      "infobipInboundParser: payload em message.type=" + type + " (A CONFIRMAR).",
      JSON.stringify(message),
    );
    return { payload: message.payload.trim(), source: "message.payload.untyped" };
  }

  return null;
}

/** Ignora delivery/seen e outros eventos não-inbound. */
export function parseInfobipInboundEvent(result: InfobipInboundResult): ParsedInfobipInbound | null {
  if (result.status) {
    return null;
  }

  const messageId = (result.messageId ?? "").trim();
  const telefoneDigits = phoneDigitsFromWhatsAppAddress(result.from ?? "");
  if (!messageId || !telefoneDigits) {
    return null;
  }

  const message = result.message;
  if (!message) {
    return null;
  }

  const type = (message.type ?? "").toUpperCase();

  const buttonInfo = extractButtonPayload(message);
  if (buttonInfo) {
    console.log(
      "infobipInboundParser: botão recebido",
      JSON.stringify({
        messageId,
        type,
        buttonSource: buttonInfo.source,
        buttonPayload: buttonInfo.payload,
        title: message.title ?? null,
        rawMessage: message,
      }),
    );
    return {
      messageId,
      telefoneDigits,
      body: (message.title ?? message.text ?? "").trim(),
      buttonPayload: buttonInfo.payload,
    };
  }

  if (type === "TEXT" || message.text?.trim()) {
    return {
      messageId,
      telefoneDigits,
      body: (message.text ?? "").trim(),
      buttonPayload: "",
    };
  }

  console.warn(
    "infobipInboundParser: evento inbound ignorado (tipo não tratado).",
    JSON.stringify({ messageId, type, message }),
  );
  return null;
}

export function parseInfobipWebhookPayload(payload: InfobipWebhookPayload): ParsedInfobipInbound[] {
  const parsed: ParsedInfobipInbound[] = [];
  for (const result of payload.results ?? []) {
    const item = parseInfobipInboundEvent(result);
    if (item) parsed.push(item);
  }
  return parsed;
}
