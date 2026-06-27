import { supabase } from "@agenda/integrations/supabase/client";

export const CLIENTE_NOME_SYNC = "sentinela:cliente-nome-sync";

export const CLIENTE_NOME_BROADCAST_EVENT = "cliente_nome_updated";

export type ClienteNomeUpdatedPayload = {
  whatsapp_digits: string;
  nome: string;
};

function familiaChannelName(titularUserId: string) {
  return `sentinela:cliente-nome:${titularUserId}`;
}

export async function resolvePainelTitularUserId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("painel_titular_user_id");
  if (error || !data) return null;
  return String(data);
}

export function whatsappMatches(stored: string | null | undefined, digits: string) {
  if (!stored) return false;
  return stored.replace(/\D/g, "") === digits;
}

export function patchClienteNomeInList<T extends { cliente_nome: string; cliente_whatsapp?: string }>(
  items: T[],
  payload: ClienteNomeUpdatedPayload,
): T[] {
  return items.map((item) =>
    whatsappMatches(item.cliente_whatsapp, payload.whatsapp_digits)
      ? { ...item, cliente_nome: payload.nome }
      : item,
  );
}

export function dispatchClienteNomeSync(payload: ClienteNomeUpdatedPayload) {
  window.dispatchEvent(new CustomEvent(CLIENTE_NOME_SYNC, { detail: payload }));
}

/** Envia broadcast para CT/CA da mesma família (outro navegador, outra aba). */
export async function emitClienteNomeUpdated(payload: ClienteNomeUpdatedPayload) {
  const titularId = await resolvePainelTitularUserId();
  if (!titularId) return;

  const channel = supabase.channel(familiaChannelName(titularId), {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel.send({
          type: "broadcast",
          event: CLIENTE_NOME_BROADCAST_EVENT,
          payload,
        });
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        resolve();
      }
    });
  });

  void supabase.removeChannel(channel);
}

export function isAgendamentoClienteNomeOnlyUpdate(payload: {
  eventType?: string;
  old?: Record<string, unknown>;
  new?: Record<string, unknown>;
}): boolean {
  if (payload.eventType !== "UPDATE" || !payload.old || !payload.new) return false;
  if (payload.old.cliente_nome === payload.new.cliente_nome) return false;

  const ignore = new Set(["cliente_nome"]);
  for (const key of Object.keys(payload.new)) {
    if (ignore.has(key)) continue;
    if (payload.old[key] !== payload.new[key]) return false;
  }
  return true;
}

export function clienteNomePayloadFromAgendamentoRow(
  row: Record<string, unknown>,
): ClienteNomeUpdatedPayload | null {
  const whatsapp = row.cliente_whatsapp;
  const nome = row.cliente_nome;
  if (typeof whatsapp !== "string" || typeof nome !== "string") return null;
  const digits = whatsapp.replace(/\D/g, "");
  const trimmed = nome.trim();
  if (digits.length < 10 || !trimmed) return null;
  return { whatsapp_digits: digits, nome: trimmed };
}
