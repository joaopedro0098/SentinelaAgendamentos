import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CLIENTE_NOME_BROADCAST_EVENT,
  CLIENTE_NOME_SYNC,
  dispatchClienteNomeSync,
  resolvePainelTitularUserId,
  type ClienteNomeUpdatedPayload,
} from "@agenda/lib/panelClienteNomeSync";

function familiaChannelName(titularUserId: string) {
  return `sentinela:cliente-nome:${titularUserId}`;
}

/** Escuta broadcast da família CT+CA (ex.: CA renomeou → CT atualiza na hora). */
export function usePainelClienteNomeBroadcast() {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void resolvePainelTitularUserId().then((titularId) => {
      if (cancelled || !titularId) return;

      channel = supabase
        .channel(familiaChannelName(titularId), {
          config: { broadcast: { self: true } },
        })
        .on("broadcast", { event: CLIENTE_NOME_BROADCAST_EVENT }, ({ payload }) => {
          const row = payload as Partial<ClienteNomeUpdatedPayload>;
          if (!row?.whatsapp_digits || !row?.nome?.trim()) return;
          dispatchClienteNomeSync({
            whatsapp_digits: row.whatsapp_digits,
            nome: row.nome.trim(),
          });
        })
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);
}

export function useClienteNomeSyncListener(onUpdate: (payload: ClienteNomeUpdatedPayload) => void) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ClienteNomeUpdatedPayload>).detail;
      if (!detail?.whatsapp_digits || !detail?.nome) return;
      onUpdateRef.current(detail);
    };
    window.addEventListener(CLIENTE_NOME_SYNC, handler);
    return () => window.removeEventListener(CLIENTE_NOME_SYNC, handler);
  }, []);
}
