/** Espelho frontend das regras de produto (Edge Function: metaTemplateProduct.ts). */

export type SentinelaTemplateCategory = "confirmacao" | "lembrete";

export type TemplateLanguage = "pt_BR" | "es" | "en_US";

export const TEMPLATE_LANGUAGE_OPTIONS: { value: TemplateLanguage; label: string }[] = [
  { value: "pt_BR", label: "Português" },
  { value: "es", label: "Español" },
  { value: "en_US", label: "English" },
];

export type TemplateVariableKey = "cliente" | "data" | "hora";

export const VARIABLE_MARKERS: Record<TemplateVariableKey, string> = {
  cliente: "⟦cliente⟧",
  data: "⟦data⟧",
  hora: "⟦hora⟧",
};

export const VARIABLE_ORDER: TemplateVariableKey[] = ["cliente", "data", "hora"];

/** Variáveis disponíveis no editor por categoria (lembrete 3h: só nome e hora). */
export function variableKeysForCategory(category: SentinelaTemplateCategory): TemplateVariableKey[] {
  if (category === "lembrete") return ["cliente", "hora"];
  return VARIABLE_ORDER;
}

export const VARIABLE_UI_LABELS: Record<TemplateLanguage, Record<TemplateVariableKey, string>> = {
  pt_BR: {
    cliente: "Nome do cliente",
    data: "Dia da semana",
    hora: "Hora",
  },
  es: {
    cliente: "Nombre del cliente",
    data: "Día de la semana",
    hora: "Hora",
  },
  en_US: {
    cliente: "Client name",
    data: "Day of week",
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
  lembrete: [],
};

export const DEFAULT_BODY_TEXT: Record<SentinelaTemplateCategory, Record<TemplateLanguage, string>> = {
  confirmacao: {
    pt_BR:
      "Olá ⟦cliente⟧, confirme seu horário na Barbearia Central no dia ⟦data⟧ às ⟦hora⟧.",
    es:
      "Hola ⟦cliente⟧, confirma tu cita en Barbería Central el día ⟦data⟧ a las ⟦hora⟧.",
    en_US:
      "Hi ⟦cliente⟧, please confirm your appointment at Central Barbershop on ⟦data⟧ at ⟦hora⟧.",
  },
  lembrete: {
    pt_BR:
      "Olá, ⟦cliente⟧, passando para lembrar que você tem um agendamento hoje comigo às ⟦hora⟧, Até logo!",
    es:
      "Hola, ⟦cliente⟧, te recuerdo que tienes una cita hoy conmigo a las ⟦hora⟧. ¡Hasta luego!",
    en_US:
      "Hi, ⟦cliente⟧, just a reminder that you have an appointment with me today at ⟦hora⟧. See you soon!",
  },
};

const PREVIEW_STATIC_EXAMPLES: Record<TemplateLanguage, Record<Exclude<TemplateVariableKey, "data">, string>> = {
  pt_BR: {
    cliente: "Maria",
    hora: "14:00",
  },
  es: {
    cliente: "María",
    hora: "14:00",
  },
  en_US: {
    cliente: "Mary",
    hora: "2:00 PM",
  },
};

function intlLocaleForTemplateLanguage(language: TemplateLanguage): string {
  if (language === "pt_BR") return "pt-BR";
  if (language === "es") return "es";
  return "en-US";
}

function exampleWeekdayForTemplate(
  language: TemplateLanguage,
  daysAfterToday = 1,
  referenceDate = new Date(),
): string {
  const d = new Date(referenceDate);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysAfterToday);
  return new Intl.DateTimeFormat(intlLocaleForTemplateLanguage(language), { weekday: "long" }).format(d);
}

function previewExampleForVariable(key: TemplateVariableKey, language: TemplateLanguage): string {
  if (key === "data") return exampleWeekdayForTemplate(language, 1);
  return PREVIEW_STATIC_EXAMPLES[language][key];
}

function listVariableKeysInBody(bodyDisplayText: string): TemplateVariableKey[] {
  return VARIABLE_ORDER.filter((key) => bodyDisplayText.includes(VARIABLE_MARKERS[key]));
}

export function enabledVariablesRecordFromBody(body: string): Record<TemplateVariableKey, boolean> {
  const present = new Set(listVariableKeysInBody(body));
  return Object.fromEntries(VARIABLE_ORDER.map((k) => [k, present.has(k)])) as Record<
    TemplateVariableKey,
    boolean
  >;
}

export function removeVariableFromBody(body: string, key: TemplateVariableKey): string {
  const marker = VARIABLE_MARKERS[key];
  return body.replace(marker, "").replace(/\s{2,}/g, " ").trim();
}

export function addVariableToBody(body: string, key: TemplateVariableKey): string {
  const marker = VARIABLE_MARKERS[key];
  if (body.includes(marker)) return body;
  const trimmed = body.trimEnd();
  if (!trimmed) return marker;
  const needsSpace = !trimmed.endsWith(" ") && !trimmed.endsWith(",") && !trimmed.endsWith(".");
  return `${trimmed}${needsSpace ? " " : ""}${marker}`;
}

export function bodyToPreviewText(body: string, language: TemplateLanguage): string {
  let out = body;
  for (const key of VARIABLE_ORDER) {
    out = out.split(VARIABLE_MARKERS[key]).join(previewExampleForVariable(key, language));
  }
  return out;
}

export function validateBodyDisplayText(
  bodyDisplayText: string,
  language: TemplateLanguage,
  enabledKeys: TemplateVariableKey[] = listVariableKeysInBody(bodyDisplayText),
): string | null {
  if (bodyDisplayText.trim().length === 0) {
    return "O texto do template não pode ficar vazio.";
  }
  if (enabledKeys.length === 0) {
    return "Selecione ao menos uma variável para usar no template.";
  }
  for (const key of VARIABLE_ORDER) {
    const present = bodyDisplayText.includes(VARIABLE_MARKERS[key]);
    const enabled = enabledKeys.includes(key);
    if (enabled && !present) {
      return `Mantenha a variável "${VARIABLE_UI_LABELS[language][key]}" no texto.`;
    }
    if (!enabled && present) {
      return `Desmarque ou remova a variável "${VARIABLE_UI_LABELS[language][key]}" do texto.`;
    }
  }
  for (const key of enabledKeys) {
    const marker = VARIABLE_MARKERS[key];
    const count = bodyDisplayText.split(marker).length - 1;
    if (count !== 1) {
      return `A variável "${VARIABLE_UI_LABELS[language][key]}" deve aparecer uma vez no texto.`;
    }
  }
  if (bodyDisplayText.length > 1024) {
    return "O texto é longo demais (máximo 1024 caracteres).";
  }
  return null;
}

type BodySegment =
  | { type: "text"; value: string }
  | { type: "variable"; key: TemplateVariableKey };

const MARKER_REGEX = /⟦(cliente|data|hora)⟧/g;

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
