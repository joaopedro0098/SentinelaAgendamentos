import {
  createServiceClient,
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

    if (!agendamentoId || !confirmationToken) {
      return jsonResponse({ error: "agendamento_id e confirmation_token são obrigatórios." }, 400);
    }

    const supabase = createServiceClient();
    let appointment;
    try {
      appointment = await loadHoldForCheckout(supabase, agendamentoId, confirmationToken);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "already_confirmed") {
        return jsonResponse({ ok: true, already_confirmed: true });
      }
      const status = message.includes("expirada") ? 410 : 400;
      return jsonResponse({ error: message }, status);
    }

    const settingsRes = await supabase.rpc("get_effective_appointment_payment_settings", {
      p_barbearia_id: appointment.barbearia_id,
    });
    const settings = settingsRes.data as Record<string, unknown> | null;
    if (!settings || settings.error) {
      return jsonResponse({ error: "Configuração de pagamento indisponível." }, 503);
    }

    if (settings.requires_payment !== true) {
      return jsonResponse({ error: "Pagamento não exigido para este agendamento." }, 400);
    }

    const amount = appointment.valor_pago_centavos ?? 0;
    if (amount < 50) {
      return jsonResponse({ error: "Valor de pagamento inválido." }, 400);
    }

    return jsonResponse({
      ok: true,
      agendamento_id: appointment.id,
      amount_centavos: amount,
      total_centavos: appointment.valor_base_centavos ?? amount,
      remaining_centavos: appointment.valor_restante_centavos ?? 0,
      expires_at: appointment.payment_expires_at,
      payment_enable_card: settings.payment_enable_card !== false,
      payment_enable_pix: settings.payment_enable_pix !== false,
      payment_max_installments: Number(settings.payment_max_installments ?? 1),
      mp_live_mode: settings.mp_live_mode ?? null,
    });
  } catch (e) {
    console.error("mp-create-appointment-checkout:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
