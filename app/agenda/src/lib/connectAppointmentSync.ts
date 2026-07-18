import type { SupabaseClient } from "@supabase/supabase-js";

export const CONNECT_APPOINTMENT_BROADCAST_EVENT = "connect_appointment_updated";

/**
 * `cliente_whatsapp` é gravado como veio do formulário (frequentemente sem o
 * "55"), mas a extensão sempre monta o canal com o telefone já normalizado
 * para E.164 BR (via `normalizeBrazilPhoneE164Digits` no extension-connect).
 * Sem essa mesma normalização aqui, o canal do broadcast nunca coincide com o
 * canal que a extensão assina, e o painel nunca recebe a atualização.
 */
function normalizeBrazilWhatsappDigits(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

export function connectWaChannelName(whatsappDigits: string) {
  const digits = normalizeBrazilWhatsappDigits(whatsappDigits);
  return `sentinela:connect-wa:${digits}`;
}

export type ConnectAppointmentBroadcastPayload = {
  whatsapp_digits: string;
  agendamento_id?: string | null;
};

export async function broadcastConnectAppointmentUpdate(
  supabase: SupabaseClient,
  whatsappDigits: string,
  agendamentoId?: string | null,
) {
  const digits = normalizeBrazilWhatsappDigits(whatsappDigits);
  if (digits.length < 10) return;

  const channel = supabase.channel(connectWaChannelName(digits), {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("broadcast_timeout")), 5000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timer);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(timer);
        reject(new Error(status));
      }
    });
  });

  await channel.send({
    type: "broadcast",
    event: CONNECT_APPOINTMENT_BROADCAST_EVENT,
    payload: {
      whatsapp_digits: digits,
      agendamento_id: agendamentoId ?? null,
    } satisfies ConnectAppointmentBroadcastPayload,
  });

  void supabase.removeChannel(channel);
}
