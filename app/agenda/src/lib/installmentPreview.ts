export type InstallmentCheckoutConfig = {
  pass_fee_to_client?: boolean;
  max_count?: number | null;
  surcharge_rates?: Record<string, number>;
  enabled?: boolean;
};

const STRIPE_PERCENT = 3.99;
const STRIPE_FIXED_CENTAVOS = 39;
const MIN_SURCHARGE_PERCENT = 3.99;

/** Preview local (UX). Valor oficial vem do servidor. */
export function previewInstallmentTotalCentavos(
  baseCentavos: number,
  installmentCount: number,
  config: InstallmentCheckoutConfig | null | undefined,
): number {
  const base = Math.max(baseCentavos, 0);
  const count = Math.max(installmentCount, 1);

  if (count <= 1) return base;
  if (!config?.enabled || !config.max_count || count > config.max_count) return base;
  if (!config.pass_fee_to_client) return base;

  const rateRaw = config.surcharge_rates?.[String(count)];
  const profPercent = Math.max(
    typeof rateRaw === "number" && Number.isFinite(rateRaw) ? rateRaw : MIN_SURCHARGE_PERCENT,
    MIN_SURCHARGE_PERCENT,
  );

  const stripePercentPart = Math.round((base * STRIPE_PERCENT) / 100);
  const basePercentual = base + stripePercentPart;
  const surcharge = Math.round((basePercentual * profPercent) / 100);
  const total = basePercentual + surcharge + STRIPE_FIXED_CENTAVOS;
  return total < 50 ? 50 : total;
}

export function buildInstallmentOptions(config: InstallmentCheckoutConfig | null | undefined): number[] {
  if (!config?.enabled || !config.max_count || config.max_count < 2) return [1];
  const max = Math.min(12, config.max_count);
  return Array.from({ length: max }, (_, i) => i + 1);
}
