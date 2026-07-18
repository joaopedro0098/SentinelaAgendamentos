import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeBrazilPhoneE164Digits } from "./twilioWhatsapp.ts";

export const CONNECT_APPOINTMENT_BROADCAST_EVENT = "connect_appointment_updated";

/**
 * `cliente_whatsapp` é gravado como veio do formulário (frequentemente sem o
 * "55"), mas a extensão sempre monta o canal com o telefone já normalizado
 * para E.164 BR (via `normalizeBrazilPhoneE164Digits` no extension-connect).
 * Sem essa mesma normalização aqui, o canal do broadcast nunca coincide com o
 * canal que a extensão assina, e o painel nunca recebe a atualização.
 */
export function connectWaChannelName(whatsappDigits: string) {
  const digits = normalizeBrazilPhoneE164Digits(whatsappDigits ?? "");
  return `sentinela:connect-wa:${digits}`;
}

export async function broadcastConnectAppointmentUpdate(
  supabase: SupabaseClient,
  whatsappDigits: string,
  agendamentoId?: string | null,
) {
  const digits = normalizeBrazilPhoneE164Digits(whatsappDigits ?? "");
  if (digits.length < 10) return;

  const channel = supabase.channel(connectWaChannelName(digits), {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("broadcast_timeout")), 5000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        reject(new Error(status));
      }
    });
  });

  await channel.send({
    type: "broadcast",
    event: CONNECT_APPOINTMENT_BROADCAST_EVENT,
    payload: { whatsapp_digits: digits, agendamento_id: agendamentoId ?? null },
  });

  await supabase.removeChannel(channel);
}
