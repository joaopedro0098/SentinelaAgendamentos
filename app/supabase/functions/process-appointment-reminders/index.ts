import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type AppointmentRow = {
  id: string;
  data: string;
  hora: string;
  cliente_nome: string;
  confirmation_token: string;
  barbearias?: { nome?: string; slug?: string } | null;
  barbeiros?: { nome?: string } | null;
  appointment_push_subscriptions?: PushSubscriptionRow[];
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dateOnlyInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDaysYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function appointmentDateTimeMs(data: string, hora: string) {
  const [year, month, day] = data.split("-").map(Number);
  const [hour, minute] = String(hora).slice(0, 5).split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0).getTime();
}

async function sendPush(params: {
  supabase: ReturnType<typeof createClient>;
  subscriptions: PushSubscriptionRow[];
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
        .from("appointment_push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), failed_at: null, failure_reason: null })
        .eq("id", sub.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar push";
      await params.supabase
        .from("appointment_push_subscriptions")
        .update({ failed_at: new Date().toISOString(), failure_reason: message })
        .eq("id", sub.id);
      console.error("push failed:", message);
    }
  }

  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const cronSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();
    const requestSecret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (cronSecret && requestSecret !== cronSecret) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
    const subject = Deno.env.get("VAPID_SUBJECT")?.trim() || "mailto:suporte@sentinelagendamentos.com";
    const appUrl = (Deno.env.get("APP_URL")?.trim() || "https://sentinelagendamentos.com").replace(/\/+$/, "");

    if (!publicKey || !privateKey) {
      return jsonResponse({ error: "VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY não configuradas." }, 503);
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: canceledCount } = await supabase.rpc("cancel_unconfirmed_appointments");

    const today = dateOnlyInSaoPaulo();
    const tomorrow = addDaysYmd(today, 1);
    const now = Date.now();
    const reminderWindowEnd = now + 3 * 60 * 60 * 1000 + 20 * 60 * 1000;

    const { data: confirmationDue } = await supabase
      .from("agendamentos")
      .select(
        "id, data, hora, cliente_nome, confirmation_token, barbearias(nome, slug), barbeiros(nome), appointment_push_subscriptions(id, endpoint, p256dh, auth)",
      )
      .eq("status", "confirmado")
      .eq("requires_client_confirmation", true)
      .is("client_confirmed_at", null)
      .is("confirmation_push_sent_at", null)
      .eq("data", tomorrow);

    let confirmationSent = 0;
    for (const appointment of (confirmationDue ?? []) as AppointmentRow[]) {
      const subscriptions = appointment.appointment_push_subscriptions ?? [];
      if (subscriptions.length === 0) continue;

      const shopName = appointment.barbearias?.nome ?? "Barbearia";
      const sent = await sendPush({
        supabase,
        subscriptions,
        title: shopName,
        body: "Clique aqui e confirme seu agendamento de amanhã para que não seja cancelado.",
        url: `${appUrl}/confirmar-agendamento/${appointment.confirmation_token}`,
      });

      if (sent > 0) {
        confirmationSent += sent;
        await supabase
          .from("agendamentos")
          .update({ confirmation_push_sent_at: new Date().toISOString() })
          .eq("id", appointment.id);
      }
    }

    const { data: reminderCandidates } = await supabase
      .from("agendamentos")
      .select(
        "id, data, hora, cliente_nome, confirmation_token, client_confirmed_at, requires_client_confirmation, barbearias(nome, slug), barbeiros(nome), appointment_push_subscriptions(id, endpoint, p256dh, auth)",
      )
      .eq("status", "confirmado")
      .is("reminder_push_sent_at", null)
      .gte("data", today)
      .lte("data", addDaysYmd(today, 1));

    let remindersSent = 0;
    for (const appointment of (reminderCandidates ?? []) as (AppointmentRow & {
      requires_client_confirmation?: boolean;
      client_confirmed_at?: string | null;
    })[]) {
      if (appointment.requires_client_confirmation && !appointment.client_confirmed_at) continue;

      const when = appointmentDateTimeMs(appointment.data, appointment.hora);
      if (when <= now || when > reminderWindowEnd) continue;

      const subscriptions = appointment.appointment_push_subscriptions ?? [];
      if (subscriptions.length === 0) continue;

      const shopName = appointment.barbearias?.nome ?? "Barbearia";
      const barberName = appointment.barbeiros?.nome ?? "profissional";
      const hora = String(appointment.hora).slice(0, 5);
      const slug = appointment.barbearias?.slug;
      const sent = await sendPush({
        supabase,
        subscriptions,
        title: `Lembrete ${shopName}`,
        body: `Você tem um agendamento confirmado para hoje às ${hora} com ${barberName}. Até já! Em caso de alteração, favor entrar em contato.`,
        url: slug ? `${appUrl}/agendar/${slug}` : appUrl,
      });

      if (sent > 0) {
        remindersSent += sent;
        await supabase
          .from("agendamentos")
          .update({ reminder_push_sent_at: new Date().toISOString() })
          .eq("id", appointment.id);
      }
    }

    return jsonResponse({
      ok: true,
      canceled: canceledCount ?? 0,
      confirmation_sent: confirmationSent,
      reminders_sent: remindersSent,
    });
  } catch (error) {
    console.error("process-appointment-reminders:", error);
    return jsonResponse({ error: "Não foi possível processar lembretes." }, 500);
  }
});
