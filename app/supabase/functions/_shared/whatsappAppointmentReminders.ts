/**
 * Lembrete D-1 via WhatsApp (template com 3 quick reply buttons:
 * "Confirmar", "Alterar", "Cancelar"). Paralelo ao lembrete por Web Push
 * (clientConfirmationPush.ts) — mesma janela/critério de agendamentos, canal diferente.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  normalizeBrazilPhoneE164Digits,
  phoneDigitsFromWhatsAppAddress,
} from "./twilioWhatsapp.ts";
import { registrarUsoMensageria } from "./whatsappUsageLog.ts";
import { formatAppointmentDateTimeBr } from "./appointmentAlertMessage.ts";
import { getOutboundThrottleOptions, processInBatches } from "./whatsappRateLimiter.ts";
import { sendWhatsAppTemplateForBarbershop } from "./whatsappMessaging.ts";
import { isWhatsAppTemplateSendEnabled } from "./barbershopMessagingProvider.ts";

const SAO_PAULO = "America/Sao_Paulo";

function saoPauloTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function saoPauloTomorrowYmd(now = new Date()) {
  const today = saoPauloTodayYmd(now);
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
  barbearias: { nome: string } | { nome: string }[] | null;
};

function shopNameFromRow(row: AppointmentForReminder) {
  const shop = row.barbearias;
  const single = Array.isArray(shop) ? shop[0] : shop;
  return single?.nome?.trim() || "sua barbearia";
}

export type WhatsAppReminderResult = {
  sent: number;
  processed: number;
  no_phone: number;
  send_failed: number;
  skipped_templates_disabled: number;
  failures: Array<{ agendamento_id: string; reason: string }>;
};

type SendReminderOutcome = { kind: "sent" } | { kind: "no_phone" } | { kind: "failed"; reason: string };

async function sendOneReminder(
  supabase: SupabaseClient,
  row: AppointmentForReminder,
): Promise<SendReminderOutcome> {
  const localDigits = phoneDigitsFromWhatsAppAddress(row.cliente_whatsapp ?? "");
  if (localDigits.length < 10) {
    return { kind: "no_phone" };
  }
  const phoneDigits = normalizeBrazilPhoneE164Digits(localDigits);

  const result = await sendWhatsAppTemplateForBarbershop(supabase, {
    to: phoneDigits,
    templateKind: "lembrete_d1",
    variables: {
      clienteNome: row.cliente_nome,
      barbeariaNome: shopNameFromRow(row),
      dataHora: formatAppointmentDateTimeBr(row.data, row.hora.slice(0, 5)),
      agendamentoId: row.id,
    },
    barbeariaId: row.barbearia_id,
  });

  await supabase.from("whatsapp_mensagens_enviadas").insert({
    agendamento_id: row.id,
    barbearia_id: row.barbearia_id,
    telefone: phoneDigits,
    tipo: "lembrete_d1",
    provider: result.provider,
    external_message_id: result.externalMessageId,
    status: "aguardando_resposta",
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
    provider: result.provider,
  });

  return { kind: "sent" };
}

export async function sendDueClientReminderWhatsApp(
  supabase: SupabaseClient,
): Promise<WhatsAppReminderResult> {
  if (!isWhatsAppTemplateSendEnabled()) {
    console.info(
      "sendDueClientReminderWhatsApp: WHATSAPP_TEMPLATE_SEND_ENABLED != true — envio de templates D-1 ignorado (aguardando aprovação Meta/Infobip).",
    );
    return {
      sent: 0,
      processed: 0,
      no_phone: 0,
      send_failed: 0,
      skipped_templates_disabled: 0,
      failures: [],
    };
  }

  const tomorrow = saoPauloTomorrowYmd();

  const { data: appointments, error } = await supabase
    .from("agendamentos")
    .select("id, barbearia_id, cliente_nome, cliente_whatsapp, data, hora, barbearias(nome)")
    .eq("status", "confirmado")
    .eq("requires_client_confirmation", true)
    .is("client_confirmed_at", null)
    .is("reminder_whatsapp_sent_at", null)
    .eq("data", tomorrow);

  if (error) throw new Error(error.message);

  const rows = (appointments ?? []) as AppointmentForReminder[];
  let sent = 0;
  let noPhone = 0;
  let sendFailed = 0;
  const failures: Array<{ agendamento_id: string; reason: string }> = [];

  const throttle = getOutboundThrottleOptions();

  await processInBatches(rows, throttle, async (row) => {
    try {
      const outcome = await sendOneReminder(supabase, row);
      if (outcome.kind === "sent") sent += 1;
      else if (outcome.kind === "no_phone") noPhone += 1;
      else if (outcome.kind === "failed") {
        sendFailed += 1;
        failures.push({ agendamento_id: row.id, reason: outcome.reason });
        console.error("sendDueClientReminderWhatsApp:", outcome.reason);
      }
    } catch (sendError) {
      sendFailed += 1;
      const reason = sendError instanceof Error ? sendError.message : "Falha ao enviar WhatsApp";
      failures.push({ agendamento_id: row.id, reason });
      console.error("sendDueClientReminderWhatsApp:", reason);
    }
  });

  return {
    sent,
    processed: rows.length,
    no_phone: noPhone,
    send_failed: sendFailed,
    skipped_templates_disabled: 0,
    failures,
  };
}
