import {
  createMpAppointmentPayment,
  createServiceClient,
  fetchMpPayment,
  getSellerAccessToken,
  loadHoldForCheckout,
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
    const formData = (body.formData ?? body.form_data) as Record<string, unknown> | undefined;
    const payerEmail = String(body.payer_email ?? "").trim() || undefined;

    if (!agendamentoId || !confirmationToken || !formData) {
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
      return jsonResponse({ error: message }, status);
    }

    const amount = appointment.valor_pago_centavos ?? 0;
    if (amount < 50) return jsonResponse({ error: "Valor de pagamento inválido." }, 400);

    const { accessToken } = await getSellerAccessToken(supabase, appointment.barbearia_id);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const paymentMethodId = String(formData.payment_method_id ?? "");
    const token = formData.token ? String(formData.token) : undefined;
    const installments = formData.installments ? Number(formData.installments) : 1;

    const payment = await createMpAppointmentPayment({
      accessToken,
      supabaseUrl,
      agendamentoId,
      amountCentavos: amount,
      paymentMethodId,
      token,
      installments,
      payerEmail,
    });

    const paymentId = String(payment.id ?? "");
    const status = String(payment.status ?? "");

    await supabase
      .from("agendamentos")
      .update({
        mp_payment_id: paymentId || null,
        installment_count: paymentMethodId !== "pix" ? installments : null,
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
    }, 402);
  } catch (e) {
    console.error("mp-process-appointment-payment:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
