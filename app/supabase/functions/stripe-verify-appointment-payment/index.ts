import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getStripe, retrieveAppointmentPaymentIntent } from "../_shared/stripeConnect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const agendamentoId = String(body.agendamento_id ?? "");
    const confirmationToken = String(body.confirmation_token ?? "");

    if (!agendamentoId || !confirmationToken) {
      return jsonResponse({ error: "agendamento_id e confirmation_token são obrigatórios." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row } = await supabase
      .from("agendamentos")
      .select("id, status, confirmation_token, payment_intent_id, barbearia_id")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (!row) return jsonResponse({ error: "Agendamento não encontrado." }, 404);
    if (row.confirmation_token !== confirmationToken) {
      return jsonResponse({ error: "Token inválido." }, 403);
    }

    if (row.status === "confirmado") {
      return jsonResponse({ ok: true, status: "confirmado" });
    }

    if (row.status !== "aguardando_pagamento" || !row.payment_intent_id) {
      return jsonResponse({ status: row.status });
    }

    const settingsRes = await supabase.rpc("get_effective_appointment_payment_settings", {
      p_barbearia_id: row.barbearia_id,
    });
    const settings = settingsRes.data as Record<string, unknown> | null;
    const connectAccountId = String(settings?.stripe_connect_account_id ?? "");

    const stripe = getStripe();
    let pi;
    try {
      pi = connectAccountId
        ? await retrieveAppointmentPaymentIntent(stripe, row.payment_intent_id, connectAccountId)
        : await stripe.paymentIntents.retrieve(row.payment_intent_id);
    } catch (e) {
      console.error("stripe-verify-appointment-payment: retrieve PI", e);
      return jsonResponse({
        error: "Não foi possível verificar o pagamento. Tente novamente em instantes.",
      }, 502);
    }

    if (pi.status === "succeeded") {
      await supabase.rpc("confirm_appointment_payment", {
        p_agendamento_id: agendamentoId,
        p_payment_intent_id: pi.id,
      });

      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-barber-new-booking`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agendamento_id: agendamentoId }),
      }).catch(() => undefined);

      return jsonResponse({ ok: true, status: "confirmado" });
    }

    if (pi.status === "canceled") {
      await supabase.rpc("fail_appointment_payment", {
        p_agendamento_id: agendamentoId,
        p_payment_intent_id: pi.id,
      });
      return jsonResponse({ status: "cancelado" });
    }

    return jsonResponse({ status: "aguardando_pagamento", payment_intent_status: pi.status });
  } catch (e) {
    console.error("stripe-verify-appointment-payment:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
