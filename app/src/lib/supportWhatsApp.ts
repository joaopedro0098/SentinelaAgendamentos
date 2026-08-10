const SUPPORT_MESSAGE = "Olá, preciso de ajuda com o Sentinela Agendamentos";
const LANDING_SUPPORT_MESSAGE = "Olá, gostaria de suporte com o sentinela.";

const APP_SUPPORT_WHATSAPP_PHONE = "5511999773308";

function unmaskPhone(value: string) {
  return value.replace(/\D/g, "");
}

function buildAppSupportWhatsAppUrl() {
  const text = encodeURIComponent(SUPPORT_MESSAGE);
  return `https://wa.me/${APP_SUPPORT_WHATSAPP_PHONE}?text=${text}`;
}

export function openAppSupportWhatsApp() {
  window.open(buildAppSupportWhatsAppUrl(), "_blank", "noopener,noreferrer");
}

export function buildLandingSupportWhatsAppUrl() {
  const text = encodeURIComponent(LANDING_SUPPORT_MESSAGE);
  return `https://wa.me/${APP_SUPPORT_WHATSAPP_PHONE}?text=${text}`;
}

export function buildSupportWhatsAppUrl(phoneDigits: string | null | undefined) {
  const digits = unmaskPhone(phoneDigits ?? "");
  if (digits.length < 10) return null;

  const full = digits.length <= 11 && !digits.startsWith("55") ? `55${digits}` : digits;
  const text = encodeURIComponent(SUPPORT_MESSAGE);
  return `https://wa.me/${full}?text=${text}`;
}
