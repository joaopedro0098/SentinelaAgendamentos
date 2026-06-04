export function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Hoje no fuso America/Sao_Paulo (YYYY-MM-DD). */
export function todayYmdSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Data mais antiga ainda dentro da retenção (2 meses), alinhada ao purge do banco. */
export function getAppointmentRetentionStartYmd(now = new Date()) {
  const todaySp = todayYmdSaoPaulo(now);
  const [y, m, d] = todaySp.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  date.setMonth(date.getMonth() - 2);
  return todayYmd(date);
}

/** Agendamento ainda consultável (não passou de 2 meses desde a data do corte). */
export function isWithinAppointmentRetention(dateYmd: string, now = new Date()) {
  return dateYmd >= getAppointmentRetentionStartYmd(now);
}

/** Data estritamente anterior a hoje (calendário local). */
export function isPastCalendarDate(dateYmd: string, now = new Date()) {
  return dateYmd < todayYmd(now);
}

/** Agendamentos de hoje ou futuros podem ser alterados/cancelados. */
export function canManageAppointment(dateYmd: string, now = new Date()) {
  return !isPastCalendarDate(dateYmd, now);
}

/**
 * Cliente pode alterar/cancelar até a meia-noite do dia anterior ao agendamento.
 * Ex.: corte em 06/06 → permitido em 04/06; a partir de 05/06 00:00, bloqueado.
 */
export function canClientSelfServiceModifyAppointment(dateYmd: string, now = new Date()) {
  const today = todayYmdSaoPaulo(now);
  const [y, m, d] = dateYmd.split("-").map(Number);
  const dayBeforeAppointment = new Date(y, m - 1, d - 1, 12, 0, 0);
  const dayBeforeYmd = todayYmd(dayBeforeAppointment);
  return today < dayBeforeYmd;
}
