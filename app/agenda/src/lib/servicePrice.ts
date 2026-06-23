export function formatServicePrice(cents: number): string {
  if (cents <= 0) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function parsePriceInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const num = Number.parseFloat(normalized);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function formatPriceInput(cents: number): string {
  if (cents <= 0) return "";
  const reais = cents / 100;
  return Number.isInteger(reais) ? String(reais) : reais.toFixed(2).replace(".", ",");
}
