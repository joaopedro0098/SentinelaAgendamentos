export function formatAppointmentDateTimeBr(ymd: string, hhmm: string) {
  const [year, month, day] = ymd.split("-");
  if (!year || !month || !day) return `${ymd} ${hhmm}`;
  return `${day}/${month}/${year} às ${hhmm}`;
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
  const acao = params.tipo === "cancelamento" ? "cancelamento" : "alteração";
  const quando = formatAppointmentDateTimeBr(params.data, params.hora);
  return `Paciente ${params.clienteNome} solicitou ${acao} do horário de ${quando}.`;
}
