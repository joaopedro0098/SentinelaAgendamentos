import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Canal Realtime (WebSocket) por sessão de handoff. */
export function facialHandoffChannelName(sessionId: string) {
  return `sentinela:facial-handoff:${sessionId}`;
}

export const FACIAL_HANDOFF_BROADCAST_EVENT = "facial_handoff_completed";

/**
 * PRIVACIDADE / REALTIME AUTHORIZATION (v1):
 * - Realtime Authorization (canal privado com RLS) exige JWT com claims; no cadastro o desktop
 *   está anônimo, sem como emitir token por sessão sem infra extra.
 * - Canais Broadcast públicos podem ser assinados por quem souber o nome do canal (UUID reduz risco,
 *   mas é obscuridade, não autorização).
 * - Mitigação v1: o broadcast NÃO inclui embedding facial — apenas session_id + status.
 *   O embedding só sai via RPC consume_facial_handoff_result(session_id, watch_token), onde
 *   watch_token fica só no desktop que criou a sessão (nunca no QR).
 */
export type FacialHandoffBroadcastPayload = {
  session_id: string;
  status: "completed" | "failed";
  error_code?: string;
};

export async function broadcastFacialHandoffCompleted(
  supabase: SupabaseClient,
  payload: FacialHandoffBroadcastPayload,
) {
  const channel = supabase.channel(facialHandoffChannelName(payload.session_id), {
    config: { broadcast: { self: false } },
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
    event: FACIAL_HANDOFF_BROADCAST_EVENT,
    payload,
  });

  await supabase.removeChannel(channel);
}
