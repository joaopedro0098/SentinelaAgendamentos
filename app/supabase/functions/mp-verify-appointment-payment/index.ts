import {
  createServiceClient,
  fetchMpPayment,
  getSellerAccessToken,
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

    if (!agendamentoId || !confirmationToken) {
      return jsonResponse({ error: "agendamento_id e confirmation_token são obrigatórios." }, 400);
    }

    const supabase = createServiceClient();

    const { data: row } = await supabase
      .from("agendamentos")
      .select("id, status, confirmation_token, mp_payment_id, barbearia_id, payment_expires_at")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (!row) return jsonResponse({ error: "Agendamento não encontrado." }, 404);
    if (row.confirmation_token !== confirmationToken) {
      return jsonResponse({ error: "Token inválido." }, 403);
    }

    if (row.status === "confirmado") {
      return jsonResponse({ ok: true, status: "confirmado" });
    }

    if (row.status === "cancelado") {
      return jsonResponse({ ok: true, status: "cancelado" });
    }

    if (row.status !== "aguardando_pagamento") {
      return jsonResponse({ error: "Status inválido." }, 400);
    }

    if (row.payment_expires_at && new Date(row.payment_expires_at).getTime() < Date.now()) {
      if (row.mp_payment_id) {
        return jsonResponse({ ok: true, status: "aguardando_pagamento", hold_expired: true });
      }
      await supabase.rpc("fail_appointment_payment", { p_agendamento_id: agendamentoId });
      return jsonResponse({ ok: true, status: "cancelado", expired: true });
    }

    if (row.mp_payment_id) {
      try {
        const { accessToken } = await getSellerAccessToken(supabase, row.barbearia_id);
        const payment = await fetchMpPayment(accessToken, row.mp_payment_id);
        const mpStatus = String(payment.status ?? "");
        const methodId = String(payment.payment_method_id ?? payment.payment_type_id ?? "");
        const isPix = methodId === "pix" || methodId === "bank_transfer";

        if (mpStatus === "approved") {
          await supabase.rpc("confirm_appointment_payment", {
            p_agendamento_id: agendamentoId,
            p_mp_payment_id: row.mp_payment_id,
          });
          return jsonResponse({ ok: true, status: "confirmado" });
        }

        if (mpStatus === "rejected" || mpStatus === "cancelled") {
          if (isPix) {
            return jsonResponse({ ok: true, status: "aguardando_pagamento", mp_status: mpStatus });
          }
          await supabase.rpc("fail_appointment_payment", {
            p_agendamento_id: agendamentoId,
            p_mp_payment_id: row.mp_payment_id,
          });
          return jsonResponse({ ok: true, status: "cancelado" });
        }

        return jsonResponse({ ok: true, status: "aguardando_pagamento", mp_status: mpStatus });
      } catch (e) {
        console.error("mp-verify fetch payment:", e);
      }
    }

    return jsonResponse({ ok: true, status: "aguardando_pagamento" });
  } catch (e) {
    console.error("mp-verify-appointment-payment:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
