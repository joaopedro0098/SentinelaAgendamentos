import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getStripe } from "../_shared/stripeConnect.ts";

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

type HoldRow = {
  id: string;
  status: string;
  confirmation_token: string;
  payment_intent_id: string | null;
  valor_pago_centavos: number | null;
  payment_expires_at: string | null;
  barbearia_id: string;
};

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

    const { data: row, error } = await supabase
      .from("agendamentos")
      .select("id, status, confirmation_token, payment_intent_id, valor_pago_centavos, payment_expires_at, barbearia_id")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!row) return jsonResponse({ error: "Agendamento não encontrado." }, 404);

    const appointment = row as HoldRow;
    if (appointment.confirmation_token !== confirmationToken) {
      return jsonResponse({ error: "Token inválido." }, 403);
    }

    if (appointment.status !== "aguardando_pagamento") {
      if (appointment.status === "confirmado") {
        return jsonResponse({ ok: true, already_confirmed: true });
      }
      return jsonResponse({ error: "Agendamento não está aguardando pagamento." }, 400);
    }

    if (appointment.payment_expires_at && new Date(appointment.payment_expires_at).getTime() < Date.now()) {
      await supabase.rpc("fail_appointment_payment", { p_agendamento_id: agendamentoId });
      return jsonResponse({ error: "Reserva expirada. Escolha outro horário." }, 410);
    }

    const settingsRes = await supabase.rpc("get_effective_appointment_payment_settings", {
      p_barbearia_id: appointment.barbearia_id,
    });
    const settings = settingsRes.data as Record<string, unknown> | null;
    const connectAccountId = String(settings?.stripe_connect_account_id ?? "");
    if (!connectAccountId) {
      return jsonResponse({ error: "Conta de pagamento não configurada." }, 503);
    }

    const stripe = getStripe();
    const amount = appointment.valor_pago_centavos ?? 0;
    if (amount < 50) return jsonResponse({ error: "Valor de pagamento inválido." }, 400);

    let paymentIntentId = appointment.payment_intent_id;
    let clientSecret: string | null = null;

    if (paymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (existing.status === "succeeded") {
        await supabase.rpc("confirm_appointment_payment", {
          p_agendamento_id: agendamentoId,
          p_payment_intent_id: paymentIntentId,
        });
        return jsonResponse({ ok: true, already_paid: true });
      }
      if (existing.status === "canceled") {
        paymentIntentId = null;
      } else {
        clientSecret = existing.client_secret;
      }
    }

    if (!paymentIntentId) {
      const pi = await stripe.paymentIntents.create({
        amount,
        currency: "brl",
        payment_method_types: ["card"],
        application_fee_amount: 0,
        transfer_data: { destination: connectAccountId },
        metadata: {
          agendamento_id: agendamentoId,
          barbearia_id: appointment.barbearia_id,
          kind: "appointment_deposit",
        },
      });
      paymentIntentId = pi.id;
      clientSecret = pi.client_secret;

      await supabase
        .from("agendamentos")
        .update({ payment_intent_id: paymentIntentId })
        .eq("id", agendamentoId);
    }

    if (!clientSecret) {
      return jsonResponse({ error: "Stripe não retornou client_secret." }, 502);
    }

    return jsonResponse({
      client_secret: clientSecret,
      payment_intent_id: paymentIntentId,
      amount_centavos: amount,
      expires_at: appointment.payment_expires_at,
    });
  } catch (e) {
    console.error("stripe-create-appointment-payment:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
