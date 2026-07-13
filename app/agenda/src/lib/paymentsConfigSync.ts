import { supabase } from "@/integrations/supabase/client";

export const PAYMENTS_CONFIG_BROADCAST_EVENT = "payments_config_changed";

export function paymentsConfigChannelName(slug: string) {
  return `sentinela:payments-config:${slug}`;
}

/** CT/AA: avisa CAs da família que as regras de pagamento mudaram (ex.: centralizar). */
export async function broadcastPaymentsConfigChanged(slug: string) {
  const slugTrim = slug.trim();
  if (!slugTrim) return;

  const channel = supabase.channel(paymentsConfigChannelName(slugTrim), {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.send({
          type: "broadcast",
          event: PAYMENTS_CONFIG_BROADCAST_EVENT,
          payload: {},
        });
        void supabase.removeChannel(channel);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        void supabase.removeChannel(channel);
        resolve();
      }
    });
  });
}

export function subscribePaymentsConfigChanged(slug: string, onChange: () => void) {
  const slugTrim = slug.trim();
  if (!slugTrim) return () => {};

  const channel = supabase
    .channel(paymentsConfigChannelName(slugTrim), {
      config: { broadcast: { self: true } },
    })
    .on("broadcast", { event: PAYMENTS_CONFIG_BROADCAST_EVENT }, () => onChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
