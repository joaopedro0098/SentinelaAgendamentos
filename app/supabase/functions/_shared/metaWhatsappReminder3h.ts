/**
 * Lembrete ~3h antes via Meta Direct (template WABA de lembrete).
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
const REMINDER_LEAD_MINUTES = 180;

function saoPauloTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseTimeToMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function saoPauloNowMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SAO_PAULO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function isInReminder3hWindow(hora: string, now = new Date()): boolean {
  const minutesUntil = parseTimeToMinutes(hora) - saoPauloNowMinutes(now);
  return minutesUntil > 0 && minutesUntil <= REMINDER_LEAD_MINUTES;
}

type AppointmentForReminder3h = {
  id: string;
  barbearia_id: string;
  cliente_nome: string;
  cliente_whatsapp: string | null;
  data: string;
  hora: string;
};

export type MetaWhatsAppReminder3hResult = {
  sent: number;
  processed: number;
  no_phone: number;
  send_failed: number;
  already_claimed: number;
  skipped_no_template: number;
  skipped_not_meta: number;
  skipped_templates_disabled: number;
  quality_limited: number;
  failures: Array<{ agendamento_id: string; reason: string }>;
};

type SendReminderOutcome =
  | { kind: "sent" }
  | { kind: "no_phone" }
  | { kind: "already_claimed" }
  | { kind: "skipped_no_template" }
  | { kind: "quality_limited"; reason: string }
  | { kind: "failed"; reason: string };

async function claimReminder3hSlot(
  supabase: SupabaseClient,
  agendamentoId: string,
): Promise<string | null> {
  const claimedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("agendamentos")
    .update({ reminder_3h_sent_at: claimedAt })
    .eq("id", agendamentoId)
    .is("reminder_3h_sent_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? claimedAt : null;
}

async function releaseReminder3hSlot(
  supabase: SupabaseClient,
  agendamentoId: string,
  claimedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("agendamentos")
    .update({ reminder_3h_sent_at: null })
    .eq("id", agendamentoId)
    .eq("reminder_3h_sent_at", claimedAt);

  if (error) {
    console.error("releaseReminder3hSlot (meta):", agendamentoId, error.message);
  }
}

async function sendOneMetaReminder3h(
  supabase: SupabaseClient,
  row: AppointmentForReminder3h,
): Promise<SendReminderOutcome> {
  const localDigits = phoneDigitsFromWhatsAppAddress(row.cliente_whatsapp ?? "");
  if (localDigits.length < 10) {
    return { kind: "no_phone" };
  }

  const claimedAt = await claimReminder3hSlot(supabase, row.id);
  if (!claimedAt) {
    return { kind: "already_claimed" };
  }

  const phoneDigits = normalizeBrazilPhoneE164Digits(localDigits);

  try {
    const result = await sendMetaWhatsAppOperationalTemplate(supabase, {
      barbeariaId: row.barbearia_id,
      toE164Digits: phoneDigits,
      templateKind: "lembrete_3h",
      appointment: {
        cliente_nome: row.cliente_nome,
        data: row.data,
        hora: row.hora,
      },
    });

    if (!result) {
      await releaseReminder3hSlot(supabase, row.id, claimedAt);
      return { kind: "skipped_no_template" };
    }

    await pinAppointmentTemplateIfUnset(
      supabase,
      row.id,
      result.wabaTemplateId,
      result.sentinelaCategory,
    );

    const sentAt = new Date().toISOString();
    await supabase.from("whatsapp_mensagens_enviadas").insert({
      agendamento_id: row.id,
      barbearia_id: row.barbearia_id,
      telefone: phoneDigits,
      tipo: "lembrete_3h",
      provider: "meta",
      external_message_id: result.externalMessageId,
      status: "respondida",
      respondido_em: sentAt,
      meta_delivery_status: "sent",
      meta_delivery_updated_at: sentAt,
    });

    const billingResult = await registrarUsoMensageria(supabase, {
      barbeariaId: row.barbearia_id,
      tipo: "lembrete_3h",
      agendamentoId: row.id,
      externalMessageId: result.externalMessageId,
      provider: "meta",
    });

    if (!billingResult.ok) {
      console.error("sendOneMetaReminder3h: billing falhou:", row.id, billingResult.error);
    }

    return { kind: "sent" };
  } catch (e) {
    await releaseReminder3hSlot(supabase, row.id, claimedAt);
    if (e instanceof MetaWhatsappSendError && e.qualityLimited) {
      return { kind: "quality_limited", reason: e.message };
    }
    const reason = e instanceof Error ? e.message : "Falha ao enviar WhatsApp Meta";
    return { kind: "failed", reason };
  }
}

export async function sendDueMetaReminder3hWhatsApp(
  supabase: SupabaseClient,
): Promise<MetaWhatsAppReminder3hResult> {
  if (!isWhatsAppTemplateSendEnabled()) {
    console.info(
      "sendDueMetaReminder3hWhatsApp: WHATSAPP_TEMPLATE_SEND_ENABLED != true — envio Meta ~3h ignorado.",
    );
    return {
      sent: 0,
      processed: 0,
      no_phone: 0,
      send_failed: 0,
      already_claimed: 0,
      skipped_no_template: 0,
      skipped_not_meta: 0,
      skipped_templates_disabled: 1,
      quality_limited: 0,
      failures: [],
    };
  }

  const today = saoPauloTodayYmd();
  const now = new Date();

  const { data: appointments, error } = await supabase
    .from("agendamentos")
    .select("id, barbearia_id, cliente_nome, cliente_whatsapp, data, hora")
    .eq("status", "confirmado")
    .is("reminder_3h_sent_at", null)
    .eq("data", today);

  if (error) throw new Error(error.message);

  const filtered = ((appointments ?? []) as AppointmentForReminder3h[]).filter((row) =>
    isInReminder3hWindow(row.hora, now)
  );

  const metaBarbeariaIds = await loadMetaDirectBarbeariaIdSet(
    supabase,
    filtered.map((r) => r.barbearia_id),
  );

  const rows = filtered.filter((r) => metaBarbeariaIds.has(r.barbearia_id));
  const skippedNotMeta = filtered.length - rows.length;

  let sent = 0;
  let noPhone = 0;
  let sendFailed = 0;
  let alreadyClaimed = 0;
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
        const outcome = await sendOneMetaReminder3h(supabase, row);
        if (outcome.kind === "sent") sent += 1;
        else if (outcome.kind === "no_phone") noPhone += 1;
        else if (outcome.kind === "already_claimed") alreadyClaimed += 1;
        else if (outcome.kind === "skipped_no_template") skippedNoTemplate += 1;
        else if (outcome.kind === "quality_limited") {
          qualityLimited += 1;
          failures.push({ agendamento_id: row.id, reason: outcome.reason });
        } else if (outcome.kind === "failed") {
          sendFailed += 1;
          failures.push({ agendamento_id: row.id, reason: outcome.reason });
          console.error("sendDueMetaReminder3hWhatsApp:", outcome.reason);
        }
      } catch (sendError) {
        sendFailed += 1;
        const reason = sendError instanceof Error ? sendError.message : "Falha ao enviar WhatsApp Meta";
        failures.push({ agendamento_id: row.id, reason });
        console.error("sendDueMetaReminder3hWhatsApp:", reason);
      }
    },
  );

  if (rows.length > 0) {
    console.info(
      `sendDueMetaReminder3hWhatsApp: processed=${rows.length} sent=${sent} skipped_not_meta=${skippedNotMeta} provider=meta`,
    );
  }

  return {
    sent,
    processed: rows.length,
    no_phone: noPhone,
    send_failed: sendFailed,
    already_claimed: alreadyClaimed,
    skipped_no_template: skippedNoTemplate,
    skipped_not_meta: skippedNotMeta,
    skipped_templates_disabled: 0,
    quality_limited: qualityLimited,
    failures,
  };
}
