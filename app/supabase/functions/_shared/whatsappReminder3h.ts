/**
 * Lembrete ~3h antes do agendamento via WhatsApp (template simples, sem botões).
 * Dispara no dia do agendamento quando faltam até 3h para o horário (America/Sao_Paulo).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  sendWhatsAppTemplate,
  normalizeBrazilPhoneE164Digits,
  phoneDigitsFromWhatsAppAddress,
} from "./twilioWhatsapp.ts";
import { resolveBarbershopTwilioCredentials } from "./barbershopTwilioCredentials.ts";
import { registrarUsoMensageria } from "./whatsappUsageLog.ts";
import { getOutboundThrottleOptions, processInBatches } from "./whatsappRateLimiter.ts";

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

/** Agendamento ainda no futuro hoje e dentro da janela de até 3h antes. */
function isInReminder3hWindow(hora: string, now = new Date()): boolean {
  const minutesUntil = parseTimeToMinutes(hora) - saoPauloNowMinutes(now);
  return minutesUntil > 0 && minutesUntil <= REMINDER_LEAD_MINUTES;
}

type AppointmentForReminder3h = {
  id: string;
  barbearia_id: string;
  cliente_nome: string;
  cliente_whatsapp: string | null;
  hora: string;
};

export type WhatsAppReminder3hResult = {
  sent: number;
  processed: number;
  no_phone: number;
  send_failed: number;
  already_claimed: number;
  failures: Array<{ agendamento_id: string; reason: string }>;
};

type SendReminderOutcome =
  | { kind: "sent" }
  | { kind: "no_phone" }
  | { kind: "already_claimed" }
  | { kind: "failed"; reason: string };

/** Reserva atômica da linha antes do envio (evita duplicata entre ticks concorrentes). */
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
    console.error(
      "releaseReminder3hSlot: falha ao reverter lock do agendamento",
      agendamentoId,
      error.message,
    );
  }
}

async function sendOneReminder3h(
  supabase: SupabaseClient,
  row: AppointmentForReminder3h,
  contentSid: string,
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
  const shopCredentials = await resolveBarbershopTwilioCredentials(supabase, row.barbearia_id);
  const horaFormatada = row.hora.slice(0, 5);

  try {
    const result = await sendWhatsAppTemplate({
      to: phoneDigits,
      contentSid,
      contentVariables: {
        "1": row.cliente_nome,
        "2": horaFormatada,
      },
      credentials: shopCredentials,
    });

    const billingResult = await registrarUsoMensageria(supabase, {
      barbeariaId: row.barbearia_id,
      tipo: "lembrete_3h",
      agendamentoId: row.id,
      twilioMessageSid: result.sid,
    });

    if (!billingResult.ok) {
      console.error(
        "sendOneReminder3h: mensagem enviada mas billing falhou:",
        row.id,
        billingResult.error,
      );
    }

    return { kind: "sent" };
  } catch (sendError) {
    await releaseReminder3hSlot(supabase, row.id, claimedAt);
    const reason = sendError instanceof Error ? sendError.message : "Falha ao enviar WhatsApp";
    return { kind: "failed", reason };
  }
}

export async function sendDueReminder3hWhatsApp(
  supabase: SupabaseClient,
): Promise<WhatsAppReminder3hResult> {
  const contentSid = Deno.env.get("TWILIO_CONTENT_SID_LEMBRETE_3H")?.trim();
  if (!contentSid) {
    throw new Error("TWILIO_CONTENT_SID_LEMBRETE_3H não configurado.");
  }

  const today = saoPauloTodayYmd();
  const now = new Date();

  const { data: appointments, error } = await supabase
    .from("agendamentos")
    .select("id, barbearia_id, cliente_nome, cliente_whatsapp, hora")
    .eq("status", "confirmado")
    .is("reminder_3h_sent_at", null)
    .eq("data", today);

  if (error) throw new Error(error.message);

  const rows = ((appointments ?? []) as AppointmentForReminder3h[]).filter((row) =>
    isInReminder3hWindow(row.hora, now)
  );

  let sent = 0;
  let noPhone = 0;
  let sendFailed = 0;
  let alreadyClaimed = 0;
  const failures: Array<{ agendamento_id: string; reason: string }> = [];

  const throttle = getOutboundThrottleOptions();

  await processInBatches(rows, throttle, async (row) => {
    try {
      const outcome = await sendOneReminder3h(supabase, row, contentSid);
      if (outcome.kind === "sent") sent += 1;
      else if (outcome.kind === "no_phone") noPhone += 1;
      else if (outcome.kind === "already_claimed") alreadyClaimed += 1;
      else if (outcome.kind === "failed") {
        sendFailed += 1;
        failures.push({ agendamento_id: row.id, reason: outcome.reason });
        console.error("sendDueReminder3hWhatsApp:", outcome.reason);
      }
    } catch (sendError) {
      sendFailed += 1;
      const reason = sendError instanceof Error ? sendError.message : "Falha ao enviar WhatsApp";
      failures.push({ agendamento_id: row.id, reason });
      console.error("sendDueReminder3hWhatsApp:", reason);
    }
  });

  return {
    sent,
    processed: rows.length,
    no_phone: noPhone,
    send_failed: sendFailed,
    already_claimed: alreadyClaimed,
    failures,
  };
}
