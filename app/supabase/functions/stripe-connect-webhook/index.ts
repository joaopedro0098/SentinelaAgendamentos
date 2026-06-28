import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";
import { getStripe, syncConnectAccountToShop } from "../_shared/stripeConnect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function jsonOk() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function finalizePaidAppointment(
  supabase: ReturnType<typeof createClient>,
  agendamentoId: string,
  paymentIntentId: string,
) {
  const { data: confirmData, error: confirmErr } = await supabase.rpc("confirm_appointment_payment", {
    p_agendamento_id: agendamentoId,
    p_payment_intent_id: paymentIntentId,
  });

  if (confirmErr) {
    console.error("stripe-connect-webhook: confirm_appointment_payment", confirmErr);
    return;
  }

  const result = confirmData as { ok?: boolean; already_confirmed?: boolean; error?: string } | null;
  if (!result?.ok && result?.error) {
    console.error("stripe-connect-webhook: confirm failed", result.error);
    return;
  }

  if (result?.ok) {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-barber-new-booking`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ agendamento_id: agendamentoId }),
    }).catch((e) => console.error("notify-barber-new-booking invoke failed", e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const signature = req.headers.get("Stripe-Signature");
    const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET")?.trim();
    if (!signature || !webhookSecret) {
      console.error("stripe-connect-webhook: secret ou assinatura ausente");
      return new Response("Webhook não configurado", { status: 500, headers: corsHeaders });
    }

    const stripe = getStripe();
    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider,
      );
    } catch (err) {
      console.error("stripe-connect-webhook: assinatura inválida", err);
      return new Response("Assinatura inválida", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const agendamentoId = pi.metadata?.agendamento_id;
      if (agendamentoId) {
        await finalizePaidAppointment(supabase, agendamentoId, pi.id);
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const agendamentoId = pi.metadata?.agendamento_id;
      if (agendamentoId) {
        await supabase.rpc("fail_appointment_payment", {
          p_agendamento_id: agendamentoId,
          p_payment_intent_id: pi.id,
        });
      }
    }

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const shopId = account.metadata?.shop_id;
      if (shopId) {
        await syncConnectAccountToShop(supabase, shopId, account);
      } else {
        const { data: shop } = await supabase
          .from("barbershops")
          .select("id")
          .eq("stripe_connect_account_id", account.id)
          .maybeSingle();
        if (shop) await syncConnectAccountToShop(supabase, shop.id, account);
      }
    }

    return jsonOk();
  } catch (e) {
    console.error("stripe-connect-webhook:", e);
    return new Response("Erro interno", { status: 500, headers: corsHeaders });
  }
});
