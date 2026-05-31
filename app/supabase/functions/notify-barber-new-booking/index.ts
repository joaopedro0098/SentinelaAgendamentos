import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  configureWebPush,
  formatDateBr,
  getAppUrl,
  sendWebPush,
  type PushSubscriptionRow,
} from "../_shared/webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AppointmentRow = {
  id: string;
  barbearia_id: string;
  cliente_nome: string;
  data: string;
  servicos_nomes: string[] | null;
  origem: string;
  status: string;
  barber_new_booking_push_sent_at: string | null;
  created_at: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildNotificationBody(appointment: AppointmentRow) {
  const servico =
    appointment.servicos_nomes && appointment.servicos_nomes.length > 0
      ? appointment.servicos_nomes.join(", ")
      : "Não informado";

  return [
    `Cliente: ${appointment.cliente_nome}`,
    `Data: ${formatDateBr(appointment.data)}`,
    `Serviço: ${servico}`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    configureWebPush();

    const body = await req.json();
    const agendamentoId = String(body.agendamento_id ?? "");
    if (!agendamentoId) {
      return jsonResponse({ error: "agendamento_id é obrigatório." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: appointment, error: appointmentError } = await supabase
      .from("agendamentos")
      .select(
        "id, barbearia_id, cliente_nome, data, servicos_nomes, origem, status, barber_new_booking_push_sent_at, created_at",
      )
      .eq("id", agendamentoId)
      .maybeSingle();

    if (appointmentError) return jsonResponse({ error: appointmentError.message }, 500);
    if (!appointment) return jsonResponse({ error: "Agendamento não encontrado." }, 404);

    const row = appointment as AppointmentRow;

    if (row.status !== "confirmado" || row.origem !== "link_publico") {
      return jsonResponse({ ok: true, skipped: true, reason: "not_public_booking" });
    }

    if (row.barber_new_booking_push_sent_at) {
      return jsonResponse({ ok: true, skipped: true, reason: "already_sent" });
    }

    const createdAtMs = new Date(row.created_at).getTime();
    if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 15 * 60 * 1000) {
      return jsonResponse({ ok: true, skipped: true, reason: "too_old" });
    }

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("barber_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("barbearia_id", row.barbearia_id);

    if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

    const subs = (subscriptions ?? []) as PushSubscriptionRow[];
    if (subs.length === 0) {
      return jsonResponse({ ok: true, sent: 0, reason: "no_subscriptions" });
    }

    const sent = await sendWebPush({
      supabase,
      subscriptions: subs,
      subscriptionTable: "barber_push_subscriptions",
      title: "Novo agendamento",
      body: buildNotificationBody(row),
      url: `${getAppUrl()}/app/agendamentos`,
    });

    if (sent > 0) {
      await supabase
        .from("agendamentos")
        .update({ barber_new_booking_push_sent_at: new Date().toISOString() })
        .eq("id", row.id);
    }

    return jsonResponse({ ok: true, sent });
  } catch (error) {
    console.error("notify-barber-new-booking:", error);
    const message = error instanceof Error ? error.message : "Não foi possível enviar a notificação.";
    const status = message.includes("VAPID") ? 503 : 500;
    return jsonResponse({ error: message }, status);
  }
});
