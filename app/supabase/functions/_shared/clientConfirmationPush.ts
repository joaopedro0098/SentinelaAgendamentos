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
  barbearia_id: string;
  cliente_whatsapp: string | null;
  confirmation_token: string;
  barbearias:
    | { nome: string; logo_url: string | null; slug: string | null }
    | { nome: string; logo_url: string | null; slug: string | null }[]
    | null;
};

type PushSubscriptionWithStatus = PushSubscriptionRow & {
  failed_at: string | null;
  last_success_at: string | null;
};

function shopFromRow(row: AppointmentForPush) {
  const shop = row.barbearias;
  if (Array.isArray(shop)) return shop[0] ?? null;
  return shop;
}

function shopNameFromRow(row: AppointmentForPush) {
  return shopFromRow(row)?.nome?.trim() || "sua barbearia";
}

function shopIconFromRow(row: AppointmentForPush) {
  const shop = shopFromRow(row);
  const slug = shop?.slug?.trim();
  if (slug) {
    return `${getAppUrl()}/manifest/agendar/${encodeURIComponent(slug)}/icon-192.png`;
  }
  const url = shop?.logo_url?.trim();
  return url || null;
}

/** Copia inscrição push de outro agendamento do mesmo cliente na mesma barbearia (ex.: painel). */
async function inheritClientPushSubscriptions(
  supabase: SupabaseClient,
  appointment: Pick<AppointmentForPush, "id">,
) {
  const { error } = await supabase.rpc("inherit_appointment_push_subscription", {
    _agendamento_id: appointment.id,
  });

  if (error) {
    console.error("inherit_appointment_push_subscription:", error.message);
  }
}

async function fetchPushSubscriptions(supabase: SupabaseClient, appointment: AppointmentForPush) {
  const { data: subscriptions, error: subsError } = await supabase
    .from("appointment_push_subscriptions")
    .select("id, endpoint, p256dh, auth, failed_at, last_success_at")
    .eq("agendamento_id", appointment.id);

  if (subsError) throw new Error(subsError.message);

  let subs = (subscriptions ?? []) as PushSubscriptionWithStatus[];
  if (subs.length === 0) {
    await inheritClientPushSubscriptions(supabase, appointment);
    const { data: inherited, error: inheritedError } = await supabase
      .from("appointment_push_subscriptions")
      .select("id, endpoint, p256dh, auth, failed_at, last_success_at")
      .eq("agendamento_id", appointment.id);

    if (inheritedError) throw new Error(inheritedError.message);
    subs = (inherited ?? []) as PushSubscriptionWithStatus[];
  }

  return subs;
}

export async function sendDueClientConfirmationPushes(
  supabase: SupabaseClient,
  options?: { force?: boolean },
) {
  if (!options?.force && !isConfirmationPushWindowSaoPaulo()) {
    return {
      skipped: true as const,
      reason: "outside_push_window" as const,
      sent: 0,
      processed: 0,
      retried: 0,
      no_subscription: 0,
      delivery_failed: 0,
    };
  }

  const tomorrow = saoPauloTomorrowYmd();

  // Elegível: push nunca entregue (confirmation_push_sent_at null), incluindo falhas anteriores na subscription.
  const { data: appointments, error } = await supabase
    .from("agendamentos")
    .select("id, barbearia_id, cliente_whatsapp, confirmation_token, barbearias(nome, logo_url, slug)")
    .eq("status", "confirmado")
    .eq("requires_client_confirmation", true)
    .is("client_confirmed_at", null)
    .is("confirmation_push_sent_at", null)
    .eq("data", tomorrow);

  if (error) throw new Error(error.message);

  const rows = (appointments ?? []) as AppointmentForPush[];
  let sentTotal = 0;
  let retried = 0;
  let noSubscription = 0;
  let deliveryFailed = 0;

  for (const row of rows) {
    let subs: PushSubscriptionWithStatus[] = [];
    try {
      subs = await fetchPushSubscriptions(supabase, row);
    } catch (subsError) {
      console.error("confirmation push subs:", subsError instanceof Error ? subsError.message : subsError);
      continue;
    }

    if (subs.length === 0) {
      noSubscription += 1;
      continue;
    }

    const hasFailedSub = subs.some((sub) => sub.failed_at !== null);
    if (hasFailedSub) retried += 1;

    const shopName = shopNameFromRow(row);
    const shopIcon = shopIconFromRow(row);
    const confirmUrl = `${getAppUrl()}/confirmar-agendamento/${row.confirmation_token}`;

    const sent = await sendWebPush({
      supabase,
      subscriptions: subs,
      subscriptionTable: "appointment_push_subscriptions",
      title: "Clique aqui",
      body: `Confirme seu agendamento com ${shopName} para amanhã.`,
      url: confirmUrl,
      icon: shopIcon,
      pushKind: "client_confirmation",
    });

    if (sent > 0) {
      await supabase
        .from("agendamentos")
        .update({ confirmation_push_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sentTotal += sent;
    } else {
      deliveryFailed += 1;
    }
  }

  return {
    skipped: false as const,
    sent: sentTotal,
    processed: rows.length,
    retried,
    no_subscription: noSubscription,
    delivery_failed: deliveryFailed,
  };
}
