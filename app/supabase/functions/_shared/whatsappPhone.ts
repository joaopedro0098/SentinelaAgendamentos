/** Normalização de telefone BR para WhatsApp (sem dependência de provedor). */

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeBrazilPhoneE164Digits(phone: string): string {
  let digits = digitsOnly(phone);
  if (digits.startsWith("0") && digits.length > 11) {
    digits = digits.replace(/^0+/, "");
  }
  if (digits.length >= 12 && digits.startsWith("55")) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

export function phoneDigitsFromWhatsAppAddress(value: string): string {
  return digitsOnly(value);
}
