// Geração de slots e cálculo de disponibilidade considerando duração total dos serviços.
// Mantemos uma só fonte de verdade pra Dashboard e PublicBooking.

export interface Window { hora_inicio: string; hora_fim: string }
export interface Bloq { hora_inicio: string | null; hora_fim: string | null }

/** Duração mínima de bloco para considerar o barbeiro “com agenda” (evita só encaixe de serviço curto). */
export const duracaoReferenciaBarbeiro = (
  servicos: { duracao_minutos: number }[],
  slotMinutos: number,
): number => {
  if (servicos.length > 0) return Math.max(...servicos.map((s) => s.duracao_minutos));
  return slotMinutos;
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Gera grade base de horários: cada próximo início avança pelo intervalo configurado. */
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
  const ocupIntervals: [number, number][] = [];
  for (const [hora, dur] of ocupados.entries()) {
    const s = toMin(hora);
    ocupIntervals.push([s, s + dur]);
  }
  for (const b of dayBloqs) {
    if (!b.hora_inicio || !b.hora_fim) {
      ocupIntervals.push([0, 24 * 60]);
    } else {
      ocupIntervals.push([toMin(b.hora_inicio.slice(0, 5)), toMin(b.hora_fim.slice(0, 5))]);
    }
  }

  return all.filter((slot) => {
    const start = toMin(slot);
    const end = start + duracaoTotal;
    const dentroJanela = windows.some(
      (w) => start >= toMin(w.hora_inicio.slice(0, 5)) && end <= toMin(w.hora_fim.slice(0, 5)),
    );
    if (!dentroJanela) return false;
    for (const [os, oe] of ocupIntervals) {
      if (start < oe && end > os) return false;
    }
    return true;
  });
};

/** Horários de grade ocupados por um agendamento (início + duração). */
export function occupiedSlotStarts(
  hora: string,
  duracaoMinutos: number,
  slotInterval: number,
): string[] {
  const start = toMin(hora.slice(0, 5));
  const end = start + Math.max(1, duracaoMinutos);
  const step = Math.max(1, slotInterval);
  const out: string[] = [];
  for (let t = start; t < end; t += step) {
    out.push(toHHMM(t));
  }
  return out;
}
