import {
  createMpAppointmentPayment,
  createServiceClient,
  explainMpPaymentFailure,
  getSellerAccessToken,
  loadHoldForCheckout,
  MpPaymentApiError,
  parsePaymentBrickSubmit,
  promoteAppointmentPaymentIfSlotAvailable,
  resolveAppointmentChargeCentavos,
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

    const amount = await resolveAppointmentChargeCentavos(supabase, {
      agendamentoId,
      barbeariaId: appointment.barbearia_id,
      isPix: brick.isPix,
      installments: brick.installments,
    });

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
      const promoted = await promoteAppointmentPaymentIfSlotAvailable(
        supabase,
        agendamentoId,
        paymentId,
      );
      if (promoted.slot_conflict) {
        return jsonResponse({ ok: true, status: "slot_conflict", payment_id: paymentId });
      }
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

    const rejected = explainMpPaymentFailure(payment as Record<string, unknown>, {
      status: String(payment.status ?? "rejected"),
      status_detail: payment.status_detail ? String(payment.status_detail) : null,
    });

    return jsonResponse({
      error: rejected.message,
      error_title: rejected.title,
      error_hint: rejected.hint,
      mp_code: rejected.mp_code,
      mp_status_detail: rejected.mp_status_detail,
      status,
      status_detail: payment.status_detail ?? null,
      release_hold: rejected.release_hold,
      retry: rejected.retry,
    }, 402);
  } catch (e) {
    console.error("mp-process-appointment-payment:", e);
    if (e instanceof MpPaymentApiError) {
      return jsonResponse({
        error: e.info.message,
        error_title: e.info.title,
        error_hint: e.info.hint,
        mp_code: e.info.mp_code,
        mp_status_detail: e.info.mp_status_detail,
        retry: e.info.retry,
        release_hold: e.info.release_hold,
        raw_message: e.info.raw_message,
      }, 502);
    }
    const message = e instanceof Error ? e.message : String(e);
    const explained = explainMpPaymentFailure(message);
    return jsonResponse({
      error: explained.message,
      error_title: explained.title,
      error_hint: explained.hint,
      mp_code: explained.mp_code,
      mp_status_detail: explained.mp_status_detail,
      retry: explained.retry,
      release_hold: explained.release_hold,
      raw_message: explained.raw_message,
    }, 500);
  }
});
