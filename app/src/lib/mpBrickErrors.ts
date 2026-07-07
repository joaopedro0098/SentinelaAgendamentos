export type MpBrickErrorExplanation = {
  title: string;
  description: string;
  hint?: string;
};

/** Mensagens amigáveis para erros do Brick (assinatura / plano). */
export function explainMpPlanBrickError(message: string): MpBrickErrorExplanation {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("bin") ||
    normalized.includes("no payment method") ||
    normalized.includes("informação de pagamento") ||
    normalized.includes("informacion de pago")
  ) {
    return {
      title: "Cartão não reconhecido",
      description:
        "O Mercado Pago não conseguiu validar esse cartão para a assinatura. Isso costuma ocorrer quando a chave pública do front (VITE_MP_PLATFORM_PUBLIC_KEY) não é da mesma conta/aplicação do MP_ACCESS_TOKEN no Supabase, ou quando se usa cartão real no modo teste.",
      hint:
        "Modo teste: cartão 5031 4332 1540 6351 · CVV 123 · validade 11/30 · titular APRO · CPF 12345678909. Use e-mail diferente do seu login Mercado Pago.",
    };
  }

  if (normalized.includes("invalid users involved")) {
    return {
      title: "Conta teste × produção",
      description: "Há mistura entre credenciais ou usuários de teste e produção no Mercado Pago.",
      hint: "Confira se VITE_MP_PLATFORM_PUBLIC_KEY e MP_ACCESS_TOKEN são ambos TEST- (ou ambos produção) da mesma aplicação.",
    };
  }

  return {
    title: "Erro no Mercado Pago",
    description: message,
  };
}
