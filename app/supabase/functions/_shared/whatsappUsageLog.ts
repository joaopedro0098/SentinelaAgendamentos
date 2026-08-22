/**
 * Ponto único de registro de uso de mensageria WhatsApp para billing.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { WhatsAppMessagingProvider } from "./barbershopMessagingProvider.ts";

export type WhatsAppUsageTipo = "lembrete_d1" | "lembrete_3h" | "alerta_profissional";

export async function registrarUsoMensageria(
  supabase: SupabaseClient,
  params: {
    barbeariaId: string;
    tipo: WhatsAppUsageTipo;
    profissionalId?: string | null;
    agendamentoId?: string | null;
    externalMessageId?: string | null;
    provider?: WhatsAppMessagingProvider;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("registrar_uso_mensageria", {
    p_barbearia_id: params.barbeariaId,
    p_tipo: params.tipo,
    p_profissional_id: params.profissionalId ?? null,
    p_agendamento_id: params.agendamentoId ?? null,
    p_external_message_id: params.externalMessageId ?? null,
    p_provider: params.provider ?? "twilio",
  });

  if (error) {
    console.error("registrarUsoMensageria:", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
