import { supabase } from "@/integrations/supabase/client";

export const SUBSCRIPTION_BLOCK_OWNER = "Renove a assinatura para agendar.";

export function getClientBookingBlockMessage(profileName: string | undefined): string {
  const name = profileName?.trim() || "o estabelecimento";
  return `Sistema bloqueado, entre em contato com ${name} por WhatsApp para que eles realizem o desbloqueio.`;
}

/** @deprecated Use getClientBookingBlockMessage */
export function getSubscriptionBlockClient(shopName: string | undefined): string {
  return getClientBookingBlockMessage(shopName);
}

export function isSubscriptionBlockError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("função bloqueada") ||
    m.includes("pagamento da mensalidade") ||
    m.includes("row-level security")
  );
}

export async function checkBarbeariaCanBook(barbeariaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_barbearia_pode_agendar", {
    p_barbearia_id: barbeariaId,
  });
  if (error) return false;
  return Boolean(data);
}
