import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  appointmentPaymentIntentNeedsReplace,
  connectAccountPixPaymentsActive,
  createAppointmentPaymentIntent,
  getStripe,
  isLegacyDestinationChargeIntent,
  refreshConnectAccountWithPix,
  retrieveAppointmentPaymentIntentForCreate,
  updateAppointmentPaymentIntent,
} from "../_shared/stripeConnect.ts";

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
  valor_base_centavos: number | null;
  payment_expires_at: string | null;
  barbearia_id: string;
};

type InstallmentCalc = {
  error?: string;
  ok?: boolean;
  total_centavos?: number;
  valor_base_centavos?: number;
  installment_count?: number;
  stripe_percent_centavos?: number;
  installment_surcharge_centavos?: number;
  installment_fixed_fee_centavos?: number;
};

function parseInstallmentCount(raw: unknown): number {
  const n = Math.trunc(Number(raw ?? 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 12);
}

function buildPaymentMetadata(agendamentoId: string, barbeariaId: string, installmentCount: number) {
  return {
    agendamento_id: agendamentoId,
    barbearia_id: barbeariaId,
    kind: "appointment_deposit",
    installment_count: String(installmentCount),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const agendamentoId = String(body.agendamento_id ?? "");
    const confirmationToken = String(body.confirmation_token ?? "");
    const installmentCount = parseInstallmentCount(body.installment_count);

    if (!agendamentoId || !confirmationToken) {
      return jsonResponse({ error: "agendamento_id e confirmation_token são obrigatórios." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error } = await supabase
      .from("agendamentos")
      .select(
        "id, status, confirmation_token, payment_intent_id, valor_pago_centavos, valor_base_centavos, payment_expires_at, barbearia_id",
      )
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

    const calcRes = await supabase.rpc("update_agendamento_installment_checkout", {
      p_agendamento_id: agendamentoId,
      p_confirmation_token: confirmationToken,
      p_installment_count: installmentCount,
    });

    if (calcRes.error) return jsonResponse({ error: calcRes.error.message }, 500);

    const calc = (calcRes.data ?? {}) as InstallmentCalc;
    if (calc.error) {
      return jsonResponse({ error: calc.error }, 400);
    }

    const amount = calc.total_centavos ?? 0;
    if (amount < 50) return jsonResponse({ error: "Valor de pagamento inválido." }, 400);

    const settingsRes = await supabase.rpc("get_effective_appointment_payment_settings", {
      p_barbearia_id: appointment.barbearia_id,
    });
    const settings = settingsRes.data as Record<string, unknown> | null;
    const connectAccountId = String(settings?.stripe_connect_account_id ?? "");
    if (!connectAccountId) {
      return jsonResponse({ error: "Conta de pagamento não configurada." }, 503);
    }

    const installmentSettings = settings?.installment as Record<string, unknown> | undefined;

    const stripe = getStripe();
    const connectAccount = await refreshConnectAccountWithPix(stripe, connectAccountId);
    if (!connectAccount.charges_enabled) {
      return jsonResponse({
        error: "A conta Stripe ainda não está pronta para receber pagamentos. Conclua o cadastro em Pagamentos.",
      }, 503);
    }

    const metadata = buildPaymentMetadata(agendamentoId, appointment.barbearia_id, installmentCount);

    let paymentIntentId = appointment.payment_intent_id;
    let clientSecret: string | null = null;

    if (paymentIntentId) {
      const existing = await retrieveAppointmentPaymentIntentForCreate(stripe, paymentIntentId, connectAccountId);
      if (existing.status === "succeeded") {
        await supabase.rpc("confirm_appointment_payment", {
          p_agendamento_id: agendamentoId,
          p_payment_intent_id: paymentIntentId,
        });
        return jsonResponse({ ok: true, already_paid: true });
      }

      if (
        existing.status !== "canceled"
        && !isLegacyDestinationChargeIntent(existing)
        && !appointmentPaymentIntentNeedsReplace(existing, amount, installmentCount)
      ) {
        clientSecret = existing.client_secret;
      } else {
        if (existing.status !== "canceled" && existing.status !== "succeeded") {
          try {
            await stripe.paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: connectAccountId });
          } catch {
            try {
              await stripe.paymentIntents.cancel(paymentIntentId);
            } catch {
              /* ignore */
            }
          }
        }
        paymentIntentId = null;
      }
    }

    if (paymentIntentId && !clientSecret) {
      try {
        const updated = await updateAppointmentPaymentIntent(stripe, paymentIntentId, connectAccountId, {
          amount,
          metadata,
          installmentCount,
          connectAccount,
        });
        clientSecret = updated.client_secret;
      } catch (updateErr) {
        console.warn("stripe-create-appointment-payment: PI update failed, recreating", updateErr);
        try {
          await stripe.paymentIntents.cancel(paymentIntentId, {}, { stripeAccount: connectAccountId });
        } catch {
          /* ignore */
        }
        paymentIntentId = null;
      }
    }

    if (!paymentIntentId) {
      const pi = await createAppointmentPaymentIntent(stripe, {
        amount,
        connectAccountId,
        connectAccount,
        installmentCount,
        metadata,
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
      valor_base_centavos: calc.valor_base_centavos ?? appointment.valor_base_centavos,
      installment_count: calc.installment_count ?? installmentCount,
      stripe_percent_centavos: calc.stripe_percent_centavos ?? 0,
      installment_surcharge_centavos: calc.installment_surcharge_centavos ?? 0,
      installment_fixed_fee_centavos: calc.installment_fixed_fee_centavos ?? 0,
      expires_at: appointment.payment_expires_at,
      stripe_connect_account_id: connectAccountId,
      installment: installmentSettings ?? null,
      pix_enabled: installmentCount <= 1 && connectAccountPixPaymentsActive(connectAccount),
    });
  } catch (e) {
    console.error("stripe-create-appointment-payment:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
