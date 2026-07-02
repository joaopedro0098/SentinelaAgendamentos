import {
  createMpAppointmentPayment,
  createServiceClient,
  getSellerAccessToken,
  loadHoldForCheckout,
  parsePaymentBrickSubmit,
} from "../_shared/mpAppointment.ts";

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
    const rawFormData = (body.formData ?? body.form_data) as Record<string, unknown> | undefined;

    if (!agendamentoId || !confirmationToken || !rawFormData) {
      return jsonResponse({ error: "Dados de pagamento incompletos." }, 400);
    }

    const supabase = createServiceClient();
    let appointment;
    try {
      appointment = await loadHoldForCheckout(supabase, agendamentoId, confirmationToken);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "already_confirmed") {
        return jsonResponse({ ok: true, already_confirmed: true, status: "confirmado" });
      }
      const status = message.includes("expirada") ? 410 : 400;
      return jsonResponse({ error: message, release_hold: status === 410 }, status);
    }

    const amount = appointment.valor_pago_centavos ?? 0;
    if (amount < 50) return jsonResponse({ error: "Valor de pagamento inválido." }, 400);

    const brick = parsePaymentBrickSubmit(rawFormData);
    if (!brick.paymentMethodId) {
      return jsonResponse({
        error: "Não foi possível identificar o meio de pagamento. Tente novamente.",
        retry: true,
      }, 400);
    }
    if (!brick.isPix && !brick.token) {
      return jsonResponse({
        error: "Dados do cartão incompletos. Tente novamente.",
        retry: true,
      }, 400);
    }

    const { accessToken } = await getSellerAccessToken(supabase, appointment.barbearia_id);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const payment = await createMpAppointmentPayment({
      accessToken,
      supabaseUrl,
      agendamentoId,
      amountCentavos: amount,
      paymentMethodId: brick.paymentMethodId,
      token: brick.token,
      installments: brick.installments,
      payerEmail: brick.payerEmail,
      payerIdentification: brick.identification,
    });

    const paymentId = String(payment.id ?? "");
    const status = String(payment.status ?? "");

    await supabase
      .from("agendamentos")
      .update({
        mp_payment_id: paymentId || null,
        installment_count: !brick.isPix ? brick.installments : null,
      })
      .eq("id", agendamentoId);

    if (status === "approved") {
      await supabase.rpc("confirm_appointment_payment", {
        p_agendamento_id: agendamentoId,
        p_mp_payment_id: paymentId,
      });
      return jsonResponse({ ok: true, status: "confirmado", payment_id: paymentId });
    }

    if (status === "pending" || status === "in_process") {
      const pixData = payment.point_of_interaction as {
        transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
      } | undefined;
      return jsonResponse({
        ok: true,
        status: "pending",
        payment_id: paymentId,
        qr_code: pixData?.transaction_data?.qr_code ?? null,
        qr_code_base64: pixData?.transaction_data?.qr_code_base64 ?? null,
        ticket_url: pixData?.transaction_data?.ticket_url ?? null,
      });
    }

    await supabase.rpc("fail_appointment_payment", {
      p_agendamento_id: agendamentoId,
      p_mp_payment_id: paymentId || null,
    });

    return jsonResponse({
      error: "Pagamento recusado pelo Mercado Pago.",
      status,
      status_detail: payment.status_detail ?? null,
      release_hold: true,
    }, 402);
  } catch (e) {
    console.error("mp-process-appointment-payment:", e);
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message, retry: true }, 500);
  }
});
