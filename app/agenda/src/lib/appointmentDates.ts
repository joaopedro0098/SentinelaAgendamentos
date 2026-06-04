export function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Data estritamente anterior a hoje (calendário local). */
export function isPastCalendarDate(dateYmd: string, now = new Date()) {
  return dateYmd < todayYmd(now);
}

/** Agendamentos de hoje ou futuros podem ser alterados/cancelados. */
export function canManageAppointment(dateYmd: string, now = new Date()) {
  return !isPastCalendarDate(dateYmd, now);
}
