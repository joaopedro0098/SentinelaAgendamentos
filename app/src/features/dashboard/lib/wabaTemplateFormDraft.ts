import {
  CATEGORY_BUTTON_OPTIONS,
  VARIABLE_ORDER,
  enabledVariablesRecordFromBody,
  type SentinelaTemplateCategory,
  type TemplateLanguage,
  type TemplateVariableKey,
} from "@/features/dashboard/lib/metaTemplateProduct";

export type WabaTemplateFormDraft = {
  body: string;
  language: TemplateLanguage;
  enabledButtons: Record<string, boolean>;
  enabledVariables: Record<TemplateVariableKey, boolean>;
};

const STORAGE_PREFIX = "sentinela:waba-template-draft:v1";

function storageKey(wabaId: string, category: SentinelaTemplateCategory): string {
  return `${STORAGE_PREFIX}:${wabaId}:${category}`;
}

function parseLanguage(value: unknown): TemplateLanguage {
  if (value === "pt_BR" || value === "es" || value === "en_US") return value;
  return "pt_BR";
}

/** Garante chaves de botões e variáveis após ler do localStorage. */
export function normalizeWabaTemplateDraft(
  category: SentinelaTemplateCategory,
  raw: WabaTemplateFormDraft,
): WabaTemplateFormDraft {
  const buttons = CATEGORY_BUTTON_OPTIONS[category];
  const enabledButtons: Record<string, boolean> = {};
  for (const b of buttons) {
    enabledButtons[b.id] = raw.enabledButtons?.[b.id] ?? true;
  }

  const enabledVariables = { ...enabledVariablesRecordFromBody(raw.body ?? "") };
  for (const key of VARIABLE_ORDER) {
    if (typeof raw.enabledVariables?.[key] === "boolean") {
      enabledVariables[key] = raw.enabledVariables[key];
    }
  }

  return {
    body: typeof raw.body === "string" ? raw.body : "",
    language: parseLanguage(raw.language),
    enabledButtons,
    enabledVariables,
  };
}

export function loadWabaTemplateDraft(
  wabaId: string,
  category: SentinelaTemplateCategory,
): WabaTemplateFormDraft | null {
  if (!wabaId) return null;
  try {
    const raw = localStorage.getItem(storageKey(wabaId, category));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WabaTemplateFormDraft;
    if (!parsed || typeof parsed.body !== "string") return null;
    return normalizeWabaTemplateDraft(category, parsed);
  } catch {
    return null;
  }
}

export function saveWabaTemplateDraft(
  wabaId: string,
  category: SentinelaTemplateCategory,
  draft: WabaTemplateFormDraft,
): void {
  if (!wabaId) return;
  try {
    localStorage.setItem(storageKey(wabaId, category), JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearWabaTemplateDraft(wabaId: string, category: SentinelaTemplateCategory): void {
  if (!wabaId) return;
  try {
    localStorage.removeItem(storageKey(wabaId, category));
  } catch {
    /* ignore */
  }
}

export function saveAllWabaTemplateDrafts(
  wabaId: string,
  forms: Record<SentinelaTemplateCategory, WabaTemplateFormDraft>,
): void {
  for (const category of ["confirmacao", "lembrete"] as const) {
    saveWabaTemplateDraft(wabaId, category, forms[category]);
  }
}
