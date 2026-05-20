export const SUBSCRIPTION_BLOCK_OWNER =
  "Renove a assinatura para agendar.";

export function getSubscriptionBlockClient(shopName: string | undefined): string {
  return `Aguardando desbloqueio de "${shopName?.trim() || "empresa"}".`;
}

export function isSubscriptionBlockError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("função bloqueada") ||
    m.includes("pagamento da mensalidade") ||
    m.includes("row-level security") ||
    m.includes("barbearia_pode_agendar")
  );
}
