/** Valor mensal cobrado (Mercado Pago). Sobrescreva com PLAN_MONTHLY_AMOUNT no Supabase. */
export function getPlanMonthlyAmount(): number {
  const raw = Deno.env.get("PLAN_MONTHLY_AMOUNT")?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 29.9;
}
