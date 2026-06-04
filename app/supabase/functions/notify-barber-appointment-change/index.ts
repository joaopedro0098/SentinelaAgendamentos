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

type ChangeEvent = "cancelled" | "rescheduled";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatTime(value: string) {
  return String(value).slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  try {
    configureWebPush();

    const body = await req.json();
    const agendamentoId = String(body.agendamento_id ?? "");
    const event = String(body.event ?? "") as ChangeEvent;
    const oldData = body.old_data ? String(body.old_data) : null;
    const newData = body.new_data ? String(body.new_data) : null;

    if (!agendamentoId || (event !== "cancelled" && event !== "rescheduled")) {
      return jsonResponse({ error: "Parâmetros inválidos." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: appointment, error: appointmentError } = await supabase
      .from("agendamentos")
      .select("id, barbearia_id, barbeiro_id, cliente_nome, data, hora, status")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (appointmentError) return jsonResponse({ error: appointmentError.message }, 500);
    if (!appointment) return jsonResponse({ error: "Agendamento não encontrado." }, 404);

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("barber_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("barbearia_id", appointment.barbearia_id);

    if (subscriptionsError) return jsonResponse({ error: subscriptionsError.message }, 500);

    const subs = (subscriptions ?? []) as PushSubscriptionRow[];
    if (subs.length === 0) {
      return jsonResponse({ ok: true, sent: 0, reason: "no_subscriptions" });
    }

    const cliente = appointment.cliente_nome ?? "Cliente";
    const linkDate = event === "rescheduled" && newData ? newData : String(appointment.data);
    const url = `${getAppUrl()}/app/agendamentos?${new URLSearchParams({
      data: linkDate,
      barbeiro: appointment.barbeiro_id,
      agendamento: appointment.id,
    }).toString()}`;

    let title = "Agendamento cancelado";
    let pushBody = `${cliente} cancelou o agendamento.`;

    if (event === "rescheduled") {
      const fromDate = oldData ?? String(appointment.data);
      const toDate = newData ?? String(appointment.data);
      title = "Agendamento alterado";
      pushBody = `${cliente} alterou de ${formatDateBr(fromDate)} para ${formatDateBr(toDate)} às ${formatTime(String(appointment.hora))}.`;
    }

    const sent = await sendWebPush({
      supabase,
      subscriptions: subs,
      subscriptionTable: "barber_push_subscriptions",
      title,
      body: pushBody,
      url,
    });

    return jsonResponse({ ok: true, sent });
  } catch (error) {
    console.error("notify-barber-appointment-change:", error);
    const message = error instanceof Error ? error.message : "Não foi possível enviar a notificação.";
    const status = message.includes("VAPID") ? 503 : 500;
    return jsonResponse({ error: message }, status);
  }
});
