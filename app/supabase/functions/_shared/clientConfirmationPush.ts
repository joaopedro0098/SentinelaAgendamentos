import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getAppUrl, sendWebPush, type PushSubscriptionRow } from "./webPush.ts";

const SAO_PAULO = "America/Sao_Paulo";

export function saoPauloTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function saoPauloTomorrowYmd(now = new Date()) {
  const today = saoPauloTodayYmd(now);
  const [y, m, d] = today.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1, 12, 0, 0);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Janela ~10h (9h–11h) em America/Sao_Paulo para o cron diário. */
export function isConfirmationPushWindowSaoPaulo(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO, hour: "numeric", hour12: false }).format(now),
  );
  return hour >= 9 && hour < 11;
}

type AppointmentForPush = {
  id: string;
  confirmation_token: string;
  barbearias: { nome: string } | { nome: string }[] | null;
};

function shopNameFromRow(row: AppointmentForPush) {
  const shop = row.barbearias;
  if (Array.isArray(shop)) return shop[0]?.nome?.trim() || "sua barbearia";
  return shop?.nome?.trim() || "sua barbearia";
}

export async function sendDueClientConfirmationPushes(
  supabase: SupabaseClient,
  options?: { force?: boolean },
) {
  if (!options?.force && !isConfirmationPushWindowSaoPaulo()) {
    return { skipped: true as const, reason: "outside_push_window" as const, sent: 0, processed: 0 };
  }

  const tomorrow = saoPauloTomorrowYmd();

  const { data: appointments, error } = await supabase
    .from("agendamentos")
    .select("id, confirmation_token, barbearias(nome)")
    .eq("status", "confirmado")
    .eq("origem", "link_publico")
    .eq("requires_client_confirmation", true)
    .is("client_confirmed_at", null)
    .is("confirmation_push_sent_at", null)
    .eq("data", tomorrow);

  if (error) throw new Error(error.message);

  const rows = (appointments ?? []) as AppointmentForPush[];
  let sentTotal = 0;

  for (const row of rows) {
    const { data: subscriptions, error: subsError } = await supabase
      .from("appointment_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("agendamento_id", row.id);

    if (subsError) {
      console.error("confirmation push subs:", subsError.message);
      continue;
    }

    const subs = (subscriptions ?? []) as PushSubscriptionRow[];
    if (subs.length === 0) continue;

    const shopName = shopNameFromRow(row);
    const confirmUrl = `${getAppUrl()}/confirmar-agendamento/${row.confirmation_token}`;

    const sent = await sendWebPush({
      supabase,
      subscriptions: subs,
      subscriptionTable: "appointment_push_subscriptions",
      title: shopName,
      body: `Clique para confirmar seu agendamento com ${shopName}`,
      url: confirmUrl,
    });

    if (sent > 0) {
      await supabase
        .from("agendamentos")
        .update({ confirmation_push_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sentTotal += sent;
    }
  }

  return { skipped: false as const, sent: sentTotal, processed: rows.length };
}
