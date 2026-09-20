/** Mesma regra de agrupamento que `cliente_whatsapp_painel_key` no Postgres. */
export function pacientePainelWhatsappKey(digits: string): string {
  const v = digits.replace(/\D/g, "");
  if (v.length < 10) return v;
  if (v.length >= 11) return v.slice(-11);
  return v;
}
