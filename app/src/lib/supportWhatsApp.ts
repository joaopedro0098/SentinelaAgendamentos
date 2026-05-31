const SUPPORT_MESSAGE = "Olá! Preciso de suporte no Sentinela Agendamentos.";

export function unmaskPhone(value: string) {
  return value.replace(/\D/g, "");
}

export function buildSupportWhatsAppUrl(phoneDigits: string | null | undefined) {
  const digits = unmaskPhone(phoneDigits ?? "");
  if (digits.length < 10) return null;

  const full = digits.length <= 11 && !digits.startsWith("55") ? `55${digits}` : digits;
  const text = encodeURIComponent(SUPPORT_MESSAGE);
  return `https://wa.me/${full}?text=${text}`;
}

export function openSupportWhatsApp(phoneDigits: string | null | undefined) {
  const url = buildSupportWhatsAppUrl(phoneDigits);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
