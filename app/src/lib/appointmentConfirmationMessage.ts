import { unmaskPhone } from "@agenda/lib/phone";

export type AppointmentMessageInput = {
  cliente_nome: string;
  data: string;
  hora: string;
  confirmation_token: string;
};

const APP_ORIGIN =
  typeof window !== "undefined" && window.location.origin
    ? window.location.origin.replace(/\/+$/, "")
    : "https://www.sentinelagendamentos.com";

export function getConfirmationPageUrl(token: string) {
  return `${APP_ORIGIN}/confirmar-agendamento/${token}`;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ex.: "amanhã sexta-feira 6" ou "sábado, dia 7 de junho" */
export function formatAppointmentDayPhrase(appointmentDateYmd: string, referenceDate = new Date()) {
  const appt = new Date(`${appointmentDateYmd}T12:00:00`);
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  const tomorrow = new Date(ref);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const weekday = appt.toLocaleDateString("pt-BR", { weekday: "long" });
  const day = appt.getDate();

  if (ymd(tomorrow) === appointmentDateYmd) {
    return `amanhã ${weekday} ${day}`;
  }

  const month = appt.toLocaleDateString("pt-BR", { month: "long" });
  return `${weekday}, dia ${day} de ${month}`;
}

export function formatAppointmentTime(hora: string) {
  return String(hora).slice(0, 5);
}

export function buildAppointmentConfirmationMessage(appointment: AppointmentMessageInput) {
  const link = getConfirmationPageUrl(appointment.confirmation_token);
  const dayPhrase = formatAppointmentDayPhrase(appointment.data);
  const time = formatAppointmentTime(appointment.hora);

  return `Olá! ${appointment.cliente_nome} você tem um agendamento para ${dayPhrase} às ${time}. Por favor, clique no link para confirmar:

Link: ${link}`;
}

export function buildClientWhatsAppUrl(phone: string, message: string) {
  const digits = unmaskPhone(phone);
  if (digits.length < 10) return null;
  const full = digits.length <= 11 && !digits.startsWith("55") ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

/** A partir da meia-noite do dia anterior ao agendamento. */
export function isInClientConfirmationWindow(appointmentDateYmd: string, now = new Date()) {
  const apptDay = new Date(`${appointmentDateYmd}T00:00:00`);
  const windowStart = new Date(apptDay);
  windowStart.setDate(windowStart.getDate() - 1);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today.getTime() >= windowStart.getTime();
}

export type ClientConfirmationBadge = "pending" | "confirmed" | null;

export function getClientConfirmationBadge(
  appointment: { data: string; client_confirmed_at: string | null },
  now = new Date(),
): ClientConfirmationBadge {
  if (!isInClientConfirmationWindow(appointment.data, now)) return null;
  if (appointment.client_confirmed_at) return "confirmed";
  return "pending";
}
