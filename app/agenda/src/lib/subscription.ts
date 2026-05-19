import { supabase } from "@/integrations/supabase/client";

export const SUBSCRIPTION_BLOCK_OWNER =
  "Função bloqueada. Favor realizar o pagamento da mensalidade para liberar.";

export const SUBSCRIPTION_BLOCK_CLIENT =
  "Agendamentos temporariamente indisponíveis. Entre em contato com a barbearia para mais informações.";

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
