export const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const unmaskPhone = (v: string) => v.replace(/\D/g, "");

export const isValidPhone = (v: string) => unmaskPhone(v).length >= 10;

/** Link wa.me (apenas dígitos; prefixo 55 se número local com 10–11 dígitos). */
export const whatsappHref = (telefone: string | null | undefined) => {
  const d = unmaskPhone(telefone ?? "");
  if (d.length < 10) return null;
  const full = d.length <= 11 && !d.startsWith("55") ? `55${d}` : d;
  return `https://wa.me/${full}`;
};
