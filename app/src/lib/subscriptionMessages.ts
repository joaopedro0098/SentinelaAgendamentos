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
    m.includes("row-level security") ||
    m.includes("barbearia_pode_agendar")
  );
}
