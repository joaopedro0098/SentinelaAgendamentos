export function formatAppointmentSlotLabel(data: string | null, hora: string | null) {
  if (!data) return "horário não informado";
  const [y, m, d] = data.split("-");
  const date = y && m && d ? `${d}/${m}/${y}` : data;
  return hora ? `${date} às ${hora}` : date;
}

function formatAppointmentSlotCompact(data: string | null, hora: string | null) {
  if (!data) return "horário não informado";
  const [, m, d] = data.split("-");
  const datePart = m && d ? `${d}/${m}` : data;
  if (!hora) return datePart;

  const [hh, mm] = hora.split(":");
  const hour = parseInt(hh, 10);
  const timePart = !mm || mm === "00" ? `${hour}h` : `${hour}h${mm}`;

  return `${datePart} às ${timePart}`;
}

/** Mensagem exibida ao profissional em Pagamentos → Pendências (Pix tardio com conflito de horário). */
export function buildSlotTakenLatePaymentMessage(
  clienteNome: string,
  agendamentoData: string | null,
  agendamentoHora: string | null,
) {
  const nome = clienteNome.trim() || "Cliente";
  const slot = formatAppointmentSlotCompact(agendamentoData, agendamentoHora);

  return `PIX tardio: ${nome} agendou ${slot} mas pagou o PIX após o prazo de 15 min. O horário foi liberado e outro paciente o ocupou. É preciso reagendar ${nome} para outro horário ou reembolsá-lo(a).`;
}
