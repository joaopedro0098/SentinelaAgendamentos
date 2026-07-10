import { unmaskPhone } from "@agenda/lib/phone";

export type AppointmentMessageInput = {
  cliente_nome: string;
  data: string;
  hora: string;
  confirmation_token: string;
  shop_name?: string | null;
};

const APP_ORIGIN =
  typeof window !== "undefined" && window.location.origin
    ? window.location.origin.replace(/\/+$/, "")
    : "https://www.sentinelagendamentos.com";

function getConfirmationPageUrl(token: string) {
  return `${APP_ORIGIN}/c/${token}`;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatAppointmentDayPhrase(appointmentDateYmd: string, referenceDate = new Date()) {
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

function formatAppointmentTime(hora: string) {
  return String(hora).slice(0, 5);
}

export function buildAppointmentConfirmationMessage(appointment: AppointmentMessageInput) {
  const link = getConfirmationPageUrl(appointment.confirmation_token);
  const dayPhrase = formatAppointmentDayPhrase(appointment.data);
  const time = formatAppointmentTime(appointment.hora);
  const shopName = appointment.shop_name?.trim();
  const shopPrefix = shopName ? `${shopName} — ` : "";

  return `${shopPrefix}Olá! ${appointment.cliente_nome} você tem um agendamento para ${dayPhrase} às ${time}. Por favor, clique no link para confirmar:

Link: ${link}`;
}

export function buildClientWhatsAppUrl(phone: string, message: string) {
  const digits = unmaskPhone(phone);
  if (digits.length < 10) return null;
  const full = digits.length <= 11 && !digits.startsWith("55") ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
