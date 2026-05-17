// Geração de slots e cálculo de disponibilidade considerando duração total dos serviços.
// Mantemos uma só fonte de verdade pra Dashboard e PublicBooking.

export interface Window { hora_inicio: string; hora_fim: string }
export interface Bloq { hora_inicio: string | null; hora_fim: string | null }

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Gera grade base de horários no intervalo de slot, dentro das janelas de trabalho. */
export const buildSlots = (windows: Window[], slotMin: number): string[] => {
  const out: string[] = [];
  for (const w of windows) {
    const start = toMin(w.hora_inicio.slice(0, 5));
    const end = toMin(w.hora_fim.slice(0, 5));
    for (let t = start; t + slotMin <= end; t += slotMin) {
      out.push(toHHMM(t));
    }
  }
  return out;
};

/**
 * Para cada slot da grade, verifica se cabe um agendamento de `duracaoTotal` minutos
 * sem colidir com:
 *  - outros agendamentos (cada um ocupando a sua duração própria)
 *  - bloqueios do dia
 *  - fim da janela de trabalho
 *
 * @param all          grade base de horários do dia (HH:MM)
 * @param windows      janelas de trabalho do barbeiro nesse dia
 * @param ocupados     mapa { hora: duracaoMinutos } dos agendamentos existentes
 * @param dayBloqs     bloqueios do dia (dia inteiro se hora_inicio for null)
 * @param duracaoTotal duração que será reservada (default = slot)
 */
export const filtrarSlotsLivres = (
  all: string[],
  windows: Window[],
  ocupados: Map<string, number>,
  dayBloqs: Bloq[],
  duracaoTotal: number,
): string[] => {
  // Constrói lista de intervalos ocupados (em minutos)
  const ocupIntervals: [number, number][] = [];
  for (const [hora, dur] of ocupados.entries()) {
    const s = toMin(hora);
    ocupIntervals.push([s, s + dur]);
  }
  for (const b of dayBloqs) {
    if (!b.hora_inicio || !b.hora_fim) {
      // dia inteiro
      ocupIntervals.push([0, 24 * 60]);
    } else {
      ocupIntervals.push([toMin(b.hora_inicio.slice(0, 5)), toMin(b.hora_fim.slice(0, 5))]);
    }
  }

  return all.filter((slot) => {
    const start = toMin(slot);
    const end = start + duracaoTotal;
    // Precisa caber dentro de alguma janela de trabalho
    const dentroJanela = windows.some(
      (w) => start >= toMin(w.hora_inicio.slice(0, 5)) && end <= toMin(w.hora_fim.slice(0, 5)),
    );
    if (!dentroJanela) return false;
    // Não pode colidir com nenhum intervalo ocupado
    for (const [os, oe] of ocupIntervals) {
      if (start < oe && end > os) return false;
    }
    return true;
  });
};
