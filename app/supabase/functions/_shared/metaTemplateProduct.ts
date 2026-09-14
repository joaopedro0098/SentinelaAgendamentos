/**
 * Regras de produto Sentinela para templates Meta (UTILITY + QUICK_REPLY).
 * Compartilhado entre Edge Function e testes.
 */

export type SentinelaTemplateCategory = "confirmacao" | "lembrete";

export type TemplateLanguage = "pt_BR" | "es" | "en_US";

export type TemplateVariableKey = "cliente" | "estabelecimento" | "data" | "hora";

/** Marcador interno no texto exibido ao profissional (convertido para {{n}} na Meta). */
export const VARIABLE_MARKERS: Record<TemplateVariableKey, string> = {
  cliente: "⟦cliente⟧",
  estabelecimento: "⟦estabelecimento⟧",
  data: "⟦data⟧",
  hora: "⟦hora⟧",
};

export const VARIABLE_UI_LABELS: Record<TemplateLanguage, Record<TemplateVariableKey, string>> = {
  pt_BR: {
    cliente: "Nome do cliente",
    estabelecimento: "Estabelecimento",
    data: "Dia da semana",
    hora: "Hora",
  },
  es: {
    cliente: "Nombre del cliente",
    estabelecimento: "Establecimiento",
    data: "Día de la semana",
    hora: "Hora",
  },
  en_US: {
    cliente: "Client name",
    estabelecimento: "Business name",
    data: "Day of week",
    hora: "Time",
  },
};

export const VARIABLE_ORDER: TemplateVariableKey[] = ["cliente", "estabelecimento", "data", "hora"];

const EXAMPLE_VALUES: Record<TemplateLanguage, Record<Exclude<TemplateVariableKey, "data">, string>> = {
  pt_BR: {
    cliente: "Maria",
    estabelecimento: "Barbearia Central",
    hora: "14:00",
  },
  es: {
    cliente: "María",
    estabelecimento: "Barbería Central",
    hora: "14:00",
  },
  en_US: {
    cliente: "Mary",
    estabelecimento: "Central Barbershop",
    hora: "2:00 PM",
  },
};

function intlLocaleForTemplateLanguage(language: TemplateLanguage): string {
  if (language === "pt_BR") return "pt-BR";
  if (language === "es") return "es";
  return "en-US";
}

/** Exemplo da variável ⟦data⟧: nome do dia da semana (padrão: amanhã). */
export function exampleWeekdayForTemplate(
  language: TemplateLanguage,
  daysAfterToday = 1,
  referenceDate = new Date(),
): string {
  const d = new Date(referenceDate);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysAfterToday);
  return new Intl.DateTimeFormat(intlLocaleForTemplateLanguage(language), { weekday: "long" }).format(d);
}

function exampleValueForVariable(key: TemplateVariableKey, language: TemplateLanguage): string {
  if (key === "data") return exampleWeekdayForTemplate(language, 1);
  return EXAMPLE_VALUES[language][key];
}

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

const META_TEMPLATE_NAME_MAX_LEN = 512;
const META_TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;

/** Valida nome técnico antes de POST/reenvio na Meta. Retorna mensagem de erro ou null se OK. */
export function validateMetaTemplateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Nome do template inválido: não pode ficar vazio.";
  }
  if (trimmed.length > META_TEMPLATE_NAME_MAX_LEN) {
    return `Nome do template inválido: máximo ${META_TEMPLATE_NAME_MAX_LEN} caracteres.`;
  }
  if (!META_TEMPLATE_NAME_PATTERN.test(trimmed)) {
    return "Nome do template inválido: use apenas letras minúsculas, números e underscore (_).";
  }
  return null;
}

/** Nome técnico Meta (lowercase + underscores). Estável por barbearia/categoria. */
export function generateMetaTemplateName(
  category: SentinelaTemplateCategory,
  barbershopId: string,
): string {
  const prefix = category === "confirmacao" ? "sentinela_confirmacao" : "sentinela_lembrete";
  const shortId = barbershopId.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${prefix}_${shortId}`;
}

export function inferCategoryFromMetaTemplateName(name: string): SentinelaTemplateCategory | null {
  const n = name.toLowerCase();
  if (n.startsWith("sentinela_confirmacao_")) return "confirmacao";
  if (n.startsWith("sentinela_lembrete_")) return "lembrete";
  return null;
}

export function parseTemplateLanguage(value: string): TemplateLanguage | null {
  const v = value.trim().replace(/-/g, "_");
  if (v === "pt_BR" || v === "es" || v === "en_US") return v;
  if (v === "pt" || v.startsWith("pt_")) return "pt_BR";
  if (v.startsWith("es")) return "es";
  if (v.startsWith("en")) return "en_US";
  return null;
}

/** Normaliza locale retornado pela Meta para o enum interno. */
export function normalizeMetaTemplateLanguage(value: string): TemplateLanguage {
  return parseTemplateLanguage(value) ?? "pt_BR";
}

export function listVariableKeysInBody(bodyDisplayText: string): TemplateVariableKey[] {
  return VARIABLE_ORDER.filter((key) => bodyDisplayText.includes(VARIABLE_MARKERS[key]));
}

export function validateBodyDisplayText(
  bodyDisplayText: string,
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
      return `O texto deve incluir a variável "${VARIABLE_UI_LABELS.pt_BR[key]}".`;
    }
    if (!enabled && present) {
      return `Remova a variável "${VARIABLE_UI_LABELS.pt_BR[key]}" do texto ou marque-a novamente.`;
    }
  }
  for (const key of enabledKeys) {
    const marker = VARIABLE_MARKERS[key];
    const count = bodyDisplayText.split(marker).length - 1;
    if (count !== 1) {
      return `A variável "${VARIABLE_UI_LABELS.pt_BR[key]}" deve aparecer exatamente uma vez no texto.`;
    }
  }
  if (bodyDisplayText.length > 1024) {
    return "O texto do template é longo demais (máximo 1024 caracteres).";
  }
  return null;
}

export type MetaBodyBuildResult = {
  text: string;
  example: { body_text: string[][] };
};

/** Converte texto com marcadores ⟦…⟧ para formato Meta {{1}}…{{4}} + exemplos. */
export function buildMetaBodyPayload(
  bodyDisplayText: string,
  language: TemplateLanguage,
  enabledKeys: TemplateVariableKey[] = listVariableKeysInBody(bodyDisplayText),
): MetaBodyBuildResult {
  const validation = validateBodyDisplayText(bodyDisplayText, enabledKeys);
  if (validation) throw new Error(validation);

  let metaText = bodyDisplayText;
  const examples: string[] = [];
  let paramIndex = 1;

  for (const key of VARIABLE_ORDER) {
    if (!enabledKeys.includes(key)) continue;
    const marker = VARIABLE_MARKERS[key];
    metaText = metaText.split(marker).join(`{{${paramIndex}}}`);
    examples.push(exampleValueForVariable(key, language));
    paramIndex += 1;
  }

  return {
    text: metaText,
    example: { body_text: [examples] },
  };
}

export type MetaQuickReplyButton = { type: "QUICK_REPLY"; text: string };

export function buildMetaButtonsPayload(
  category: SentinelaTemplateCategory,
  language: TemplateLanguage,
  enabledButtonIds: string[],
): MetaQuickReplyButton[] {
  const options = CATEGORY_BUTTON_OPTIONS[category];
  const buttons: MetaQuickReplyButton[] = [];

  for (const opt of options) {
    if (!enabledButtonIds.includes(opt.id)) continue;
    const text = opt.label[language];
    if (text.length > 25) {
      throw new Error(`Texto do botão "${text}" excede 25 caracteres.`);
    }
    buttons.push({ type: "QUICK_REPLY", text });
  }

  if (buttons.length > 3) {
    throw new Error("Máximo de 3 botões por template.");
  }

  return buttons;
}

export function resolveQuickReplyLabels(
  category: SentinelaTemplateCategory,
  language: TemplateLanguage,
  enabledButtonIds: string[],
): string[] {
  return buildMetaButtonsPayload(category, language, enabledButtonIds).map((b) => b.text);
}

export type MetaTemplateComponents = Array<
  | { type: "BODY"; text: string; example: { body_text: string[][] } }
  | { type: "BUTTONS"; buttons: MetaQuickReplyButton[] }
>;

export function buildMetaTemplateComponents(
  bodyDisplayText: string,
  language: TemplateLanguage,
  category: SentinelaTemplateCategory,
  enabledButtonIds: string[],
): MetaTemplateComponents {
  const body = buildMetaBodyPayload(bodyDisplayText, language);
  const components: MetaTemplateComponents = [
    { type: "BODY", text: body.text, example: body.example },
  ];

  const buttons = buildMetaButtonsPayload(category, language, enabledButtonIds);
  if (buttons.length > 0) {
    components.push({ type: "BUTTONS", buttons });
  }

  return components;
}

/** Traduz motivo de rejeição Meta para linguagem simples (pt). */
export function translateRejectionReason(raw: string | null | undefined): string {
  if (!raw || raw === "NONE") {
    return "A Meta não aprovou este template. Revise o texto e tente enviar novamente.";
  }

  const normalized = raw.toUpperCase().replace(/\s+/g, "_");

  const map: Record<string, string> = {
    ABUSIVE_CONTENT:
      "O texto foi considerado inadequado ou ofensivo. Use linguagem neutra e profissional.",
    INVALID_FORMAT:
      "O formato do template não está correto. Verifique o texto e os botões.",
    PROMOTIONAL:
      "O conteúdo parece promocional demais para a categoria escolhida. Foque em informações do agendamento.",
    TAG_CONTENT_MISMATCH:
      "O conteúdo não combina com o tipo de mensagem (utilidade). Evite linguagem de marketing.",
    SCAM:
      "O conteúdo foi interpretado como suspeito. Revise links, promessas ou tom da mensagem.",
  };

  return map[normalized] ??
    "A Meta não aprovou este template. Ajuste o texto conforme as orientações e reenvie.";
}

export function mapGraphErrorToUserMessage(
  status: number,
  metaMessage: string | undefined,
  metaCode?: number,
): string {
  if (status === 401 || metaCode === 190) {
    return "Sua conexão com a Meta expirou. Reconecte o WhatsApp em Integrações para continuar.";
  }
  if (status === 403 || metaCode === 200) {
    return "Permissão insuficiente na Meta para gerenciar templates. Reconecte o WhatsApp ou aguarde aprovação do app.";
  }
  if (metaCode === 2388019) {
    return "Sua conta WhatsApp atingiu o limite de templates na Meta. Exclua templates antigos no WhatsApp Manager ou verifique o portfólio de negócios antes de criar novos.";
  }
  if (metaCode === 80008) {
    return "Muitas tentativas em sequência. Aguarde alguns minutos e tente novamente.";
  }
  if (metaMessage) {
    return metaMessage;
  }
  return "Não foi possível concluir a operação na Meta. Tente novamente.";
}
