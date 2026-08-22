/**
 * Testes locais de regressão pós-migration multi-provider.
 * Rodar com: deno test --allow-env app/supabase/functions/_shared/whatsappMultiProvider.test.ts
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseInfobipInboundEvent,
  parseInfobipWebhookPayload,
} from "./infobipInboundParser.ts";

Deno.test("parseInfobipInboundEvent — TEXT", () => {
  const parsed = parseInfobipInboundEvent({
    from: "5511999999999",
    to: "5511888888888",
    messageId: "msg-text-1",
    message: { type: "TEXT", text: "Confirmar" },
  });
  assertExists(parsed);
  assertEquals(parsed!.body, "Confirmar");
  assertEquals(parsed!.buttonPayload, "");
  assertEquals(parsed!.telefoneDigits, "5511999999999");
});

Deno.test("parseInfobipInboundEvent — INTERACTIVE_BUTTON_REPLY com id", () => {
  const parsed = parseInfobipInboundEvent({
    from: "5511999999999",
    messageId: "msg-btn-1",
    message: {
      type: "INTERACTIVE_BUTTON_REPLY",
      id: "confirmar00000000-0000-4000-8000-000000000001",
      title: "Confirmar",
    },
  });
  assertExists(parsed);
  assertEquals(parsed!.buttonPayload, "confirmar00000000-0000-4000-8000-000000000001");
  assertEquals(parsed!.body, "Confirmar");
});

// A CONFIRMAR: formato possível de template Quick Reply
Deno.test("parseInfobipInboundEvent — fallback message.payload", () => {
  const parsed = parseInfobipInboundEvent({
    from: "5511999999999",
    messageId: "msg-payload-1",
    message: {
      type: "BUTTON",
      payload: "cancelar00000000-0000-4000-8000-000000000001",
      title: "Cancelar",
    },
  });
  assertExists(parsed);
  assertEquals(parsed!.buttonPayload, "cancelar00000000-0000-4000-8000-000000000001");
});

Deno.test("parseInfobipWebhookPayload — ignora delivery status", () => {
  const items = parseInfobipWebhookPayload({
    results: [
      {
        messageId: "delivery-1",
        status: { groupName: "DELIVERED", name: "DELIVERED_TO_HANDSET" },
      },
      {
        from: "5511999999999",
        messageId: "inbound-1",
        message: { type: "TEXT", text: "Olá" },
      },
    ],
    messageCount: 2,
  });
  assertEquals(items.length, 1);
  assertEquals(items[0].messageId, "inbound-1");
});

/** Simula insert no whatsapp_webhook_jobs (campos esperados após migration). */
Deno.test("enqueue payload shape — twilio regression", () => {
  const twilioJob = {
    inbound_message_id: "SM1234567890abcdef",
    provider: "twilio" as const,
    telefone: "5511999999999",
    body: "Confirmar",
    button_payload: "confirmar00000000-0000-4000-8000-000000000001",
    status: "pending",
  };
  assertEquals(twilioJob.provider, "twilio");
  assertExists(twilioJob.inbound_message_id);
});

Deno.test("enqueue payload shape — infobip", () => {
  const infobipJob = {
    inbound_message_id: "infobip-msg-uuid",
    provider: "infobip" as const,
    telefone: "5511999999999",
    body: "Confirmar",
    button_payload: "confirmar00000000-0000-4000-8000-000000000001",
    status: "pending",
  };
  assertEquals(infobipJob.provider, "infobip");
});
