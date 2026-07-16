/**
 * Ponto único de registro de uso de mensageria WhatsApp para billing.
 *
 * TODO(billing-stripe-meter): hoje esta função só grava o log interno (tabela
 * whatsapp_usage_log, via RPC registrar_uso_mensageria). Quando o Meter for criado no
 * Stripe Dashboard (Billing → Meters), adicionar aqui a chamada real:
 *
 *   const stripe = getStripeClient(); // _shared/stripePlatformBilling.ts
 *   await stripe.billing.meterEvents.create({
 *     event_name: Deno.env.get("STRIPE_USAGE_METER_EVENT_NAME")!,
 *     payload: { stripe_customer_id: <resolver a partir de barbeariaId>, value: "1" },
 *   });
 *
 * IMPORTANTE: toda mensagem WhatsApp disparada pelo backend (lembrete D-1 ou alerta ao
 * profissional) DEVE passar por esta função — não chame o Twilio em nenhum outro lugar
 * sem também chamar `registrarUsoMensageria`. Isso mantém a lógica de billing isolada
 * num único lugar, para facilitar a troca de "log interno" -> "Stripe Meter Events"
 * sem refactor grande.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type WhatsAppUsageTipo = "lembrete_d1" | "alerta_profissional";

export async function registrarUsoMensageria(
  supabase: SupabaseClient,
  params: {
    barbeariaId: string;
    tipo: WhatsAppUsageTipo;
    profissionalId?: string | null;
    agendamentoId?: string | null;
    twilioMessageSid?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("registrar_uso_mensageria", {
    p_barbearia_id: params.barbeariaId,
    p_tipo: params.tipo,
    p_profissional_id: params.profissionalId ?? null,
    p_agendamento_id: params.agendamentoId ?? null,
    p_twilio_message_sid: params.twilioMessageSid ?? null,
  });

  if (error) {
    console.error("registrarUsoMensageria:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
