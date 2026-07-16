export function formatAppointmentDateTimeBr(ymd: string, hhmm: string) {
  const [year, month, day] = ymd.split("-");
  if (!year || !month || !day) return `${ymd} ${hhmm}`;
  return `${day}/${month}/${year} às ${hhmm}`;
}

function formatAppointmentDateShortBr(ymd: string) {
  const [year, month, day] = ymd.split("-");
  if (!year || !month || !day) return ymd;
  return `${day}/${month}`;
}

/**
 * Mensagem usada tanto no template Twilio enviado ao profissional quanto no
 * registro do alerta (alertas_agendamento.mensagem) — precisam ficar idênticas.
 */
export function buildAppointmentAlertMessage(params: {
  tipo: "cancelamento" | "alteracao";
  clienteNome: string;
  data: string;
  hora: string;
}) {
  const verbo = params.tipo === "cancelamento" ? "cancelar" : "alterar";
  const dataCurta = formatAppointmentDateShortBr(params.data);
  const hhmm = params.hora.slice(0, 5);
  return `${params.clienteNome} deseja ${verbo} o agendamento de amanhã (${dataCurta} às ${hhmm}). Entre em contato para resolver.`;
}
