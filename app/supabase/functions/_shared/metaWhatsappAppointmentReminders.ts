/**
 * Lembrete D-1 via Meta Direct (template WABA de confirmação).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  normalizeBrazilPhoneE164Digits,
  phoneDigitsFromWhatsAppAddress,
} from "./whatsappPhone.ts";
import { registrarUsoMensageria } from "./whatsappUsageLog.ts";
import { getMetaOutboundThrottleOptions, processInBatchesByKey } from "./metaWhatsappRateLimiter.ts";
import { isWhatsAppTemplateSendEnabled } from "./barbershopMessagingProvider.ts";
import { MetaWhatsappSendError } from "./metaWhatsapp.ts";
import {
  loadMetaDirectBarbeariaIdSet,
  sendMetaWhatsAppOperationalTemplate,
} from "./metaWhatsappMessaging.ts";
import { pinAppointmentTemplateIfUnset } from "./metaWabaTemplateAppointments.ts";

const SAO_PAULO = "America/Sao_Paulo";

function saoPauloTomorrowYmd(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1, 12, 0, 0);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

type AppointmentForReminder = {
  id: string;
  barbearia_id: string;
  cliente_nome: string;
  cliente_whatsapp: string | null;
  data: string;
  hora: string;
};

export type MetaWhatsAppReminderResult = {
  sent: number;
  processed: number;
  no_phone: number;
  send_failed: number;
  skipped_no_template: number;
  skipped_not_meta: number;
  skipped_templates_disabled: number;
  quality_limited: number;
  failures: Array<{ agendamento_id: string; reason: string }>;
};

type SendReminderOutcome =
  | { kind: "sent" }
  | { kind: "no_phone" }
  | { kind: "skipped_no_template" }
  | { kind: "quality_limited"; reason: string }
  | { kind: "failed"; reason: string };

async function sendOneMetaReminder(
  supabase: SupabaseClient,
  row: AppointmentForReminder,
): Promise<SendReminderOutcome> {
  const localDigits = phoneDigitsFromWhatsAppAddress(row.cliente_whatsapp ?? "");
  if (localDigits.length < 10) {
    return { kind: "no_phone" };
  }
  const phoneDigits = normalizeBrazilPhoneE164Digits(localDigits);

  let result;
  try {
    result = await sendMetaWhatsAppOperationalTemplate(supabase, {
      barbeariaId: row.barbearia_id,
      toE164Digits: phoneDigits,
      templateKind: "lembrete_d1",
      appointment: {
        cliente_nome: row.cliente_nome,
        data: row.data,
        hora: row.hora,
      },
    });
  } catch (e) {
    if (e instanceof MetaWhatsappSendError && e.qualityLimited) {
      return {
        kind: "quality_limited",
        reason: e.message,
      };
    }
    const reason = e instanceof Error ? e.message : "Falha ao enviar WhatsApp Meta";
    return { kind: "failed", reason };
  }

  if (!result) {
    return { kind: "skipped_no_template" };
  }

  await pinAppointmentTemplateIfUnset(
    supabase,
    row.id,
    result.wabaTemplateId,
    result.sentinelaCategory,
  );

  await supabase.from("whatsapp_mensagens_enviadas").insert({
    agendamento_id: row.id,
    barbearia_id: row.barbearia_id,
    telefone: phoneDigits,
    tipo: "lembrete_d1",
    provider: "meta",
    external_message_id: result.externalMessageId,
    status: "aguardando_resposta",
    meta_send_message_status: result.messageStatus ?? null,
    meta_delivery_status: "sent",
    meta_delivery_updated_at: new Date().toISOString(),
  });

  await supabase
    .from("agendamentos")
    .update({ reminder_whatsapp_sent_at: new Date().toISOString() })
    .eq("id", row.id);

  await registrarUsoMensageria(supabase, {
    barbeariaId: row.barbearia_id,
    tipo: "lembrete_d1",
    agendamentoId: row.id,
    externalMessageId: result.externalMessageId,
    provider: "meta",
  });

  return { kind: "sent" };
}

export async function sendDueMetaClientReminderWhatsApp(
  supabase: SupabaseClient,
): Promise<MetaWhatsAppReminderResult> {
  if (!isWhatsAppTemplateSendEnabled()) {
    console.info(
      "sendDueMetaClientReminderWhatsApp: WHATSAPP_TEMPLATE_SEND_ENABLED != true — envio Meta D-1 ignorado.",
    );
    return {
      sent: 0,
      processed: 0,
      no_phone: 0,
      send_failed: 0,
      skipped_no_template: 0,
      skipped_not_meta: 0,
      skipped_templates_disabled: 1,
      quality_limited: 0,
      failures: [],
    };
  }

  const tomorrow = saoPauloTomorrowYmd();

  const { data: appointments, error } = await supabase
    .from("agendamentos")
    .select("id, barbearia_id, cliente_nome, cliente_whatsapp, data, hora")
    .eq("status", "confirmado")
    .eq("requires_client_confirmation", true)
    .is("client_confirmed_at", null)
    .is("reminder_whatsapp_sent_at", null)
    .eq("data", tomorrow);

  if (error) throw new Error(error.message);

  const allRows = (appointments ?? []) as AppointmentForReminder[];
  const metaBarbeariaIds = await loadMetaDirectBarbeariaIdSet(
    supabase,
    allRows.map((r) => r.barbearia_id),
    "lembrete_d1",
  );

  const rows = allRows.filter((r) => metaBarbeariaIds.has(r.barbearia_id));
  const skippedNotMeta = allRows.length - rows.length;

  let sent = 0;
  let noPhone = 0;
  let sendFailed = 0;
  let skippedNoTemplate = 0;
  let qualityLimited = 0;
  const failures: Array<{ agendamento_id: string; reason: string }> = [];

  const throttle = getMetaOutboundThrottleOptions();

  await processInBatchesByKey(
    rows,
    (row) => row.barbearia_id,
    throttle,
    async (row) => {
      try {
        const outcome = await sendOneMetaReminder(supabase, row);
        if (outcome.kind === "sent") sent += 1;
        else if (outcome.kind === "no_phone") noPhone += 1;
        else if (outcome.kind === "skipped_no_template") skippedNoTemplate += 1;
        else if (outcome.kind === "quality_limited") {
          qualityLimited += 1;
          failures.push({ agendamento_id: row.id, reason: outcome.reason });
          console.error("sendDueMetaClientReminderWhatsApp quality_limited:", row.id, outcome.reason);
        } else if (outcome.kind === "failed") {
          sendFailed += 1;
          failures.push({ agendamento_id: row.id, reason: outcome.reason });
          console.error("sendDueMetaClientReminderWhatsApp:", outcome.reason);
        }
      } catch (sendError) {
        sendFailed += 1;
        const reason = sendError instanceof Error ? sendError.message : "Falha ao enviar WhatsApp Meta";
        failures.push({ agendamento_id: row.id, reason });
        console.error("sendDueMetaClientReminderWhatsApp:", reason);
      }
    },
  );

  if (rows.length > 0) {
    console.info(
      `sendDueMetaClientReminderWhatsApp: processed=${rows.length} sent=${sent} skipped_not_meta=${skippedNotMeta} provider=meta`,
    );
  }

  return {
    sent,
    processed: rows.length,
    no_phone: noPhone,
    send_failed: sendFailed,
    skipped_no_template: skippedNoTemplate,
    skipped_not_meta: skippedNotMeta,
    skipped_templates_disabled: 0,
    quality_limited: qualityLimited,
    failures,
  };
}
