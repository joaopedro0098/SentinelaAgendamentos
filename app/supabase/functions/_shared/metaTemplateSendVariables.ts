/**
 * Parâmetros de body para envio Meta a partir de body_display_text do template.
 */
import {
  listVariableKeysInBody,
  normalizeMetaTemplateLanguage,
  type TemplateLanguage,
  type TemplateVariableKey,
} from "./metaTemplateProduct.ts";

const SAO_PAULO = "America/Sao_Paulo";

function intlLocaleForTemplateLanguage(language: TemplateLanguage): string {
  if (language === "pt_BR") return "pt-BR";
  if (language === "es") return "es";
  return "en-US";
}

/** Dia da semana da data do agendamento (YYYY-MM-DD) em America/Sao_Paulo. */
export function weekdayLabelForAppointmentDate(
  dateYmd: string,
  language: TemplateLanguage,
): string {
  const trimmed = dateYmd.trim();
  const instant = new Date(`${trimmed}T12:00:00-03:00`);
  return new Intl.DateTimeFormat(intlLocaleForTemplateLanguage(language), {
    weekday: "long",
    timeZone: SAO_PAULO,
  }).format(instant);
}

function formatHoraForTemplate(hora: string, _language: TemplateLanguage): string {
  return hora.slice(0, 5);
}

export type AppointmentTemplateFields = {
  cliente_nome: string;
  data: string;
  hora: string;
};

export function buildMetaTemplateBodyParameters(
  bodyDisplayText: string,
  languageInput: string,
  appointment: AppointmentTemplateFields,
): string[] {
  const language = normalizeMetaTemplateLanguage(languageInput);
  const keys = listVariableKeysInBody(bodyDisplayText);

  return keys.map((key: TemplateVariableKey) => {
    if (key === "cliente") return appointment.cliente_nome.trim() || "Cliente";
    if (key === "data") return weekdayLabelForAppointmentDate(appointment.data, language);
    if (key === "hora") return formatHoraForTemplate(appointment.hora, language);
    return "";
  });
}
