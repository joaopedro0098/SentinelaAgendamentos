import { maskPhone } from "@agenda/lib/phone";

export function formatWhatsAppDisplay(digits: string) {
  if (digits.length === 11) return maskPhone(digits);
  if (digits.length === 10) return maskPhone(`9${digits}`);
  return digits;
}

/** dd/mm/yy para exibição no cabeçalho do paciente. */
export function formatDataNascimentoShort(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return "—";
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y.slice(-2)}`;
}

export function calcIdadeFromYmd(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function formatHistoricoDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatHoraPainel(hora: string) {
  return String(hora).slice(0, 5);
}

export function anotacaoSnippet(text: string | null | undefined, max = 120): string {
  const t = text?.trim();
  if (!t) return "Sem anotação registrada.";
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}
