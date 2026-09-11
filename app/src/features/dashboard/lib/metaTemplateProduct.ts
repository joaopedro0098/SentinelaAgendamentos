/** Espelho frontend das regras de produto (Edge Function: metaTemplateProduct.ts). */

export type SentinelaTemplateCategory = "confirmacao" | "lembrete";

export type TemplateLanguage = "pt_BR" | "es" | "en_US";

export const TEMPLATE_LANGUAGE_OPTIONS: { value: TemplateLanguage; label: string }[] = [
  { value: "pt_BR", label: "Português" },
  { value: "es", label: "Español" },
  { value: "en_US", label: "English" },
];

export type TemplateVariableKey = "cliente" | "estabelecimento" | "data" | "hora";

export const VARIABLE_MARKERS: Record<TemplateVariableKey, string> = {
  cliente: "⟦cliente⟧",
  estabelecimento: "⟦estabelecimento⟧",
  data: "⟦data⟧",
  hora: "⟦hora⟧",
};

export const VARIABLE_ORDER: TemplateVariableKey[] = ["cliente", "estabelecimento", "data", "hora"];

export const VARIABLE_UI_LABELS: Record<TemplateLanguage, Record<TemplateVariableKey, string>> = {
  pt_BR: {
    cliente: "Nome do cliente",
    estabelecimento: "Estabelecimento",
    data: "Data",
    hora: "Hora",
  },
  es: {
    cliente: "Nombre del cliente",
    estabelecimento: "Establecimiento",
    data: "Fecha",
    hora: "Hora",
  },
  en_US: {
    cliente: "Client name",
    estabelecimento: "Business name",
    data: "Date",
    hora: "Time",
  },
};

export const CATEGORY_DISPLAY_LABEL: Record<SentinelaTemplateCategory, string> = {
  confirmacao: "Template de confirmação",
  lembrete: "Template de lembrete",
};

export const CATEGORY_BUTTON_OPTIONS: Record<
  SentinelaTemplateCategory,
  { id: string; label: Record<TemplateLanguage, string> }[]
> = {
  confirmacao: [
    { id: "confirmar", label: { pt_BR: "Confirmar", es: "Confirmar", en_US: "Confirm" } },
    { id: "remarcar", label: { pt_BR: "Remarcar", es: "Reprogramar", en_US: "Reschedule" } },
    { id: "cancelar", label: { pt_BR: "Cancelar", es: "Cancelar", en_US: "Cancel" } },
  ],
  lembrete: [
    { id: "confirmar", label: { pt_BR: "Confirmar", es: "Confirmar", en_US: "Confirm" } },
    { id: "remarcar", label: { pt_BR: "Remarcar", es: "Reprogramar", en_US: "Reschedule" } },
    { id: "cancelar", label: { pt_BR: "Cancelar", es: "Cancelar", en_US: "Cancel" } },
  ],
};

export const DEFAULT_BODY_TEXT: Record<SentinelaTemplateCategory, Record<TemplateLanguage, string>> = {
  confirmacao: {
    pt_BR:
      "Olá ⟦cliente⟧, confirme seu horário em ⟦estabelecimento⟧ no dia ⟦data⟧ às ⟦hora⟧.",
    es:
      "Hola ⟦cliente⟧, confirma tu cita en ⟦estabelecimento⟧ el día ⟦data⟧ a las ⟦hora⟧.",
    en_US:
      "Hi ⟦cliente⟧, please confirm your appointment at ⟦estabelecimento⟧ on ⟦data⟧ at ⟦hora⟧.",
  },
  lembrete: {
    pt_BR:
      "Olá ⟦cliente⟧, lembrete: você tem horário em ⟦estabelecimento⟧ no dia ⟦data⟧ às ⟦hora⟧.",
    es:
      "Hola ⟦cliente⟧, recordatorio: tienes cita en ⟦estabelecimento⟧ el día ⟦data⟧ a las ⟦hora⟧.",
    en_US:
      "Hi ⟦cliente⟧, reminder: you have an appointment at ⟦estabelecimento⟧ on ⟦data⟧ at ⟦hora⟧.",
  },
};

export function validateBodyDisplayText(bodyDisplayText: string, language: TemplateLanguage): string | null {
  for (const key of VARIABLE_ORDER) {
    if (!bodyDisplayText.includes(VARIABLE_MARKERS[key])) {
      return `Mantenha a variável "${VARIABLE_UI_LABELS[language][key]}" no texto.`;
    }
  }
  if (bodyDisplayText.length > 1024) {
    return "O texto é longo demais (máximo 1024 caracteres).";
  }
  return null;
}

export type BodySegment =
  | { type: "text"; value: string }
  | { type: "variable"; key: TemplateVariableKey };

const MARKER_REGEX = /⟦(cliente|estabelecimento|data|hora)⟧/g;

export function parseBodyDisplayText(text: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(MARKER_REGEX.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "variable", key: match[1] as TemplateVariableKey });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

export function serializeBodySegments(segments: BodySegment[]): string {
  return segments
    .map((s) => (s.type === "text" ? s.value : VARIABLE_MARKERS[s.key]))
    .join("");
}

export function parseTemplateLanguage(value: string): TemplateLanguage | null {
  const v = value.trim().replace(/-/g, "_");
  if (v === "pt_BR" || v === "es" || v === "en_US") return v;
  if (v === "pt" || v.startsWith("pt_")) return "pt_BR";
  if (v.startsWith("es")) return "es";
  if (v.startsWith("en")) return "en_US";
  return null;
}

export function statusBadgeLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "Aprovado";
    case "PENDING":
    case "IN_APPEAL":
      return "Em análise";
    case "REJECTED":
      return "Rejeitado";
    case "DISABLED":
    case "PAUSED":
      return "Indisponível";
    default:
      return status;
  }
}
