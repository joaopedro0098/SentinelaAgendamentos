/**
 * Regras de produto Sentinela para templates Meta (UTILITY + QUICK_REPLY).
 * Compartilhado entre Edge Function e testes.
 */

export type SentinelaTemplateCategory = "confirmacao" | "lembrete";

export type TemplateLanguage = "pt_BR" | "es" | "en_US";

export const TEMPLATE_LANGUAGE_OPTIONS: { value: TemplateLanguage; label: string }[] = [
  { value: "pt_BR", label: "Português" },
  { value: "es", label: "Español" },
  { value: "en_US", label: "English" },
];

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

const VARIABLE_ORDER: TemplateVariableKey[] = ["cliente", "estabelecimento", "data", "hora"];

const EXAMPLE_VALUES: Record<TemplateLanguage, Record<TemplateVariableKey, string>> = {
  pt_BR: {
    cliente: "Maria",
    estabelecimento: "Barbearia Central",
    data: "15/09/2026",
    hora: "14:00",
  },
  es: {
    cliente: "María",
    estabelecimento: "Barbería Central",
    data: "15/09/2026",
    hora: "14:00",
  },
  en_US: {
    cliente: "Mary",
    estabelecimento: "Central Barbershop",
    data: "09/15/2026",
    hora: "2:00 PM",
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

export function validateBodyDisplayText(bodyDisplayText: string): string | null {
  for (const key of VARIABLE_ORDER) {
    if (!bodyDisplayText.includes(VARIABLE_MARKERS[key])) {
      return `O texto deve incluir a variável "${VARIABLE_UI_LABELS.pt_BR[key]}".`;
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
): MetaBodyBuildResult {
  const validation = validateBodyDisplayText(bodyDisplayText);
  if (validation) throw new Error(validation);

  let metaText = bodyDisplayText;
  const examples: string[] = [];

  VARIABLE_ORDER.forEach((key, index) => {
    const marker = VARIABLE_MARKERS[key];
    if (!metaText.includes(marker)) {
      throw new Error(`Variável obrigatória ausente: ${key}`);
    }
    metaText = metaText.split(marker).join(`{{${index + 1}}}`);
    examples.push(EXAMPLE_VALUES[language][key]);
  });

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
  if (metaCode === 80008) {
    return "Muitas tentativas em sequência. Aguarde alguns minutos e tente novamente.";
  }
  if (metaMessage) {
    return metaMessage;
  }
  return "Não foi possível concluir a operação na Meta. Tente novamente.";
}
