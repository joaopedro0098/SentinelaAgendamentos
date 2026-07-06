export type PlanTier = "start" | "pro";

export type PlanTierDefinition = {
  id: PlanTier;
  name: string;
  priceLabel: string;
  priceShort: string;
  amount: number;
  highlight?: boolean;
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
      "Agendamento completo no painel",
      "Link público para clientes agendarem",
      "Colaboradores e serviços ilimitados",
      "Confirmação automática 1 dia antes",
      "Suporte via WhatsApp",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "R$ 49,90/mês",
    priceShort: "R$ 49,90",
    amount: 49.9,
    highlight: true,
    features: [
      "Tudo do plano Start",
      "Cobrança no link público (Pix e cartão)",
      "Aba Pagamentos no painel",
      "Conexão Mercado Pago para receber consultas",
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
