export type PlanTier = "start" | "pro";

export type PlanTierDefinition = {
  id: PlanTier;
  name: string;
  priceLabel: string;
  priceShort: string;
  amount: number;
  features: string[];
};

export const PLAN_TIERS: PlanTierDefinition[] = [
  {
    id: "start",
    name: "Start",
    priceLabel: "R$ 39,90/mês",
    priceShort: "R$ 39,90",
    amount: 39.9,
    features: [
      "Agendamentos e gerenciamento de equipe",
      "Link público para clientes agendarem",
      "Colaboradores e serviços ilimitados",
      "Suporte via WhatsApp",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "R$ 49,90/mês",
    priceShort: "R$ 49,90",
    amount: 49.9,
    features: [
      "Tudo do plano Start",
      "Link de pagamento: o cliente pode pagar o valor integral ou parcial antecipadamente para confirmar o agendamento",
    ],
  },
];

export function getPlanTier(id: string | null | undefined): PlanTierDefinition | null {
  const normalized = id?.trim().toLowerCase();
  return PLAN_TIERS.find((tier) => tier.id === normalized) ?? null;
}

export function planTierLabel(tier: PlanTier | null | undefined): string {
  if (tier === "pro") return "Pro";
  if (tier === "start") return "Start";
  return "—";
}
