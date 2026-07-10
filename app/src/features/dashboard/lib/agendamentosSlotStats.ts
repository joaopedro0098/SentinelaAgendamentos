import { buildSlots, filtrarSlotsLivres, type Window } from "@agenda/lib/slots";
import type { AgendamentoPainelItem } from "@/features/dashboard/lib/agendamentosPanel";
import { ymd, getWeekRange, parseYmd } from "@/features/dashboard/lib/agendamentosPanel";

export type ProfScheduleInput = {
  id: string;
  slot_minutos: number;
  disponibilidades: { dia_semana: number; hora_inicio: string; hora_fim: string }[];
  bloqueios: { data: string; hora_inicio: string | null; hora_fim: string | null }[];
};

export type DaySlotDisplayStatus = "open" | "no_shift" | "full";

export type DaySlotStats = {
  occupied: number;
  total: number;
  status: DaySlotDisplayStatus;
};

export type OccupancyRingTone = "green" | "yellow" | "red";

function formatHora(hora: string) {
  return String(hora).slice(0, 5);
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function windowsForDay(schedule: ProfScheduleInput, dateYmd: string): Window[] {
  const dow = new Date(`${dateYmd}T12:00:00`).getDay();
  return schedule.disponibilidades
    .filter((d) => d.dia_semana === dow)
    .map((d) => ({
      hora_inicio: d.hora_inicio.slice(0, 5),
      hora_fim: d.hora_fim.slice(0, 5),
    }))
    .sort((a, b) => toMin(a.hora_inicio) - toMin(b.hora_inicio));
}

export function profWorksOnDay(schedule: ProfScheduleInput, dateYmd: string) {
  return windowsForDay(schedule, dateYmd).length > 0;
}

export function getDayBloqueios(schedule: ProfScheduleInput, dateYmd: string) {
  return schedule.bloqueios.filter((b) => b.data === dateYmd);
}

export function buildAppointmentOccupancyMap(
  barbeiroId: string,
  dayAppointments: AgendamentoPainelItem[],
) {
  const ocup = new Map<string, number>();
  for (const a of dayAppointments) {
    if (a.barbeiro_id === barbeiroId && a.status !== "cancelado") {
      ocup.set(formatHora(a.hora), a.duracao_minutos);
    }
  }
  return ocup;
}

export function getProfDaySlotContext(
  dateYmd: string,
  schedule: ProfScheduleInput,
  dayAppointments: AgendamentoPainelItem[],
) {
  const windows = windowsForDay(schedule, dateYmd);
  if (!windows.length) return null;

  const slotMin = schedule.slot_minutos || 30;
  const allSlots = buildSlots(windows, slotMin);
  const ocup = buildAppointmentOccupancyMap(schedule.id, dayAppointments);
  const dayBloqs = getDayBloqueios(schedule, dateYmd);
  const livres = filtrarSlotsLivres(allSlots, windows, ocup, dayBloqs, slotMin);

  return { windows, slotMin, allSlots, livres, dayBloqs, ocup };
}

export function occupancyPercent(stats: Pick<DaySlotStats, "occupied" | "total">) {
  if (stats.total <= 0) return 0;
  return Math.min(100, Math.round((stats.occupied / stats.total) * 100));
}

export function getOccupancyRingTone(stats: Pick<DaySlotStats, "occupied" | "total" | "status">): OccupancyRingTone {
  if (stats.status !== "open") return "red";
  const pct = occupancyPercent(stats);
  if (pct <= 49) return "green";
  if (pct <= 80) return "yellow";
  return "red";
}

function finalizeSlotStats(occupied: number, total: number): DaySlotStats {
  if (total <= 0) return { occupied: 0, total: 0, status: "no_shift" };
  return {
    occupied,
    total,
    status: occupied >= total ? "full" : "open",
  };
}

/** Slots ocupados e total da grade de um profissional em um dia (bloqueios e férias incluídos). */
export function computeProfDaySlotStats(
  dateYmd: string,
  schedule: ProfScheduleInput,
  dayAppointments: AgendamentoPainelItem[],
): DaySlotStats {
  const context = getProfDaySlotContext(dateYmd, schedule, dayAppointments);
  if (!context) return { occupied: 0, total: 0, status: "no_shift" };

  const { allSlots, livres } = context;
  const total = allSlots.length;
  const occupied = total - livres.length;
  return finalizeSlotStats(occupied, total);
}

/** Soma slots de vários profissionais no mesmo dia (modo Todos). */
export function computeAggregatedDaySlotStats(
  dateYmd: string,
  schedules: ProfScheduleInput[],
  dayAppointments: AgendamentoPainelItem[],
): DaySlotStats {
  const workingSchedules = schedules.filter((schedule) => profWorksOnDay(schedule, dateYmd));
  if (!workingSchedules.length) {
    return { occupied: 0, total: 0, status: "no_shift" };
  }

  let occupied = 0;
  let total = 0;
  for (const schedule of workingSchedules) {
    const stats = computeProfDaySlotStats(dateYmd, schedule, dayAppointments);
    occupied += stats.occupied;
    total += stats.total;
  }

  return finalizeSlotStats(occupied, total);
}

/** Agrega várias estatísticas diárias (ex.: mês inteiro) em um único total. */
export function aggregateSlotStats(statsList: Iterable<DaySlotStats>): DaySlotStats {
  let occupied = 0;
  let total = 0;
  for (const stats of statsList) {
    occupied += stats.occupied;
    total += stats.total;
  }
  return finalizeSlotStats(occupied, total);
}

/** Total de slots do mês (soma de todos os dias visíveis no filtro). */
export function computeMonthPeriodSlotStats(
  displayMonth: Date,
  schedules: ProfScheduleInput[],
  appointments: AgendamentoPainelItem[],
  profId: string | null,
): DaySlotStats {
  const dayStats = buildMonthDayStats(displayMonth, schedules, appointments, profId);
  return aggregateSlotStats(dayStats.values());
}

/** Total de slots de um único dia (filtro Dia). */
export function computeDayPeriodSlotStats(
  dateYmd: string,
  schedules: ProfScheduleInput[],
  appointments: AgendamentoPainelItem[],
  profId: string | null,
): DaySlotStats {
  const activeSchedules = profId ? schedules.filter((s) => s.id === profId) : schedules;
  const dayAppointments = appointments.filter((a) => a.data === dateYmd);
  return computeAggregatedDaySlotStats(dateYmd, activeSchedules, dayAppointments);
}

/** Mapa dia → ocupação para cada célula do calendário mensal. */
export function buildMonthDayStats(
  displayMonth: Date,
  schedules: ProfScheduleInput[],
  appointments: AgendamentoPainelItem[],
  profId: string | null,
): Map<string, DaySlotStats> {
  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const activeSchedules = profId ? schedules.filter((s) => s.id === profId) : schedules;
  const result = new Map<string, DaySlotStats>();

  for (let d = 1; d <= daysInMonth; d++) {
    const key = ymd(new Date(year, month, d));
    const dayAppts = appointments.filter((a) => a.data === key);
    result.set(key, computeAggregatedDaySlotStats(key, activeSchedules, dayAppts));
  }

  return result;
}

/** Mapa dia → ocupação para cada célula da semana (domingo–sábado). */
export function buildWeekDayStats(
  anchorYmd: string,
  schedules: ProfScheduleInput[],
  appointments: AgendamentoPainelItem[],
  profId: string | null,
): Map<string, DaySlotStats> {
  const { start } = getWeekRange(parseYmd(anchorYmd));
  const activeSchedules = profId ? schedules.filter((s) => s.id === profId) : schedules;
  const result = new Map<string, DaySlotStats>();

  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = ymd(day);
    const dayAppts = appointments.filter((a) => a.data === key);
    result.set(key, computeAggregatedDaySlotStats(key, activeSchedules, dayAppts));
  }

  return result;
}

/** Total de slots da semana (soma domingo–sábado). */
export function computeWeekPeriodSlotStats(
  anchorYmd: string,
  schedules: ProfScheduleInput[],
  appointments: AgendamentoPainelItem[],
  profId: string | null,
): DaySlotStats {
  const dayStats = buildWeekDayStats(anchorYmd, schedules, appointments, profId);
  return aggregateSlotStats(dayStats.values());
}
