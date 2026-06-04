import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type SubscriptionTable = "barber_push_subscriptions";

export function configureWebPush() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  const subject = Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:suporte@sentinelagendamentos.com";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY não configuradas.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, privateKey, subject };
}

export function getAppUrl() {
  return (Deno.env.get("APP_URL")?.trim() || "https://sentinelagendamentos.com").replace(/\/+$/, "");
}

export function formatDateBr(ymd: string) {
  const [year, month, day] = ymd.split("-");
  if (!year || !month || !day) return ymd;
  return `${day}/${month}/${year}`;
}

export async function sendWebPush(params: {
  supabase: SupabaseClient;
  subscriptions: PushSubscriptionRow[];
  subscriptionTable: SubscriptionTable;
  title: string;
  body: string;
  url: string;
}) {
  let sent = 0;

  for (const sub of params.subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: params.title,
          body: params.body,
          url: params.url,
        }),
      );

      sent += 1;
      await params.supabase
        .from(params.subscriptionTable)
        .update({ last_success_at: new Date().toISOString(), failed_at: null, failure_reason: null })
        .eq("id", sub.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar push";
      await params.supabase
        .from(params.subscriptionTable)
        .update({ failed_at: new Date().toISOString(), failure_reason: message })
        .eq("id", sub.id);
      console.error("push failed:", message);
    }
  }

  return sent;
}
