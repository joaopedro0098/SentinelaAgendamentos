import { buildSlots, filtrarSlotsLivres, type Window } from "@agenda/lib/slots";
import type { AgendamentoPainelItem } from "@/features/dashboard/lib/agendamentosPanel";
import { ymd } from "@/features/dashboard/lib/agendamentosPanel";

export type ProfScheduleInput = {
  id: string;
  slot_minutos: number;
  disponibilidades: { dia_semana: number; hora_inicio: string; hora_fim: string }[];
  bloqueios: { data: string; hora_inicio: string | null; hora_fim: string | null }[];
};

export type DaySlotStats = { occupied: number; total: number };

function formatHora(hora: string) {
  return String(hora).slice(0, 5);
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function windowsForDay(schedule: ProfScheduleInput, dateYmd: string): Window[] {
  const dow = new Date(`${dateYmd}T12:00:00`).getDay();
  return schedule.disponibilidades
    .filter((d) => d.dia_semana === dow)
    .map((d) => ({
      hora_inicio: d.hora_inicio.slice(0, 5),
      hora_fim: d.hora_fim.slice(0, 5),
    }))
    .sort((a, b) => toMin(a.hora_inicio) - toMin(b.hora_inicio));
}

/** Slots ocupados e total da grade de um profissional em um dia (mesma lógica do painel dia). */
export function computeProfDaySlotStats(
  dateYmd: string,
  schedule: ProfScheduleInput,
  dayAppointments: AgendamentoPainelItem[],
): DaySlotStats {
  const windows = windowsForDay(schedule, dateYmd);
  if (!windows.length) return { occupied: 0, total: 0 };

  const slotMin = schedule.slot_minutos || 30;
  const allSlots = buildSlots(windows, slotMin);
  const ocup = new Map<string, number>();
  for (const a of dayAppointments) {
    if (a.barbeiro_id === schedule.id && a.status !== "cancelado") {
      ocup.set(formatHora(a.hora), a.duracao_minutos);
    }
  }
  const dayBloqs = schedule.bloqueios.filter((b) => b.data === dateYmd);
  const livres = filtrarSlotsLivres(allSlots, windows, ocup, dayBloqs, slotMin);
  const total = allSlots.length;
  return { occupied: total - livres.length, total };
}

/** Soma slots de vários profissionais no mesmo dia (modo Todos). */
export function computeAggregatedDaySlotStats(
  dateYmd: string,
  schedules: ProfScheduleInput[],
  dayAppointments: AgendamentoPainelItem[],
): DaySlotStats {
  let occupied = 0;
  let total = 0;
  for (const schedule of schedules) {
    const stats = computeProfDaySlotStats(dateYmd, schedule, dayAppointments);
    occupied += stats.occupied;
    total += stats.total;
  }
  return { occupied, total };
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
