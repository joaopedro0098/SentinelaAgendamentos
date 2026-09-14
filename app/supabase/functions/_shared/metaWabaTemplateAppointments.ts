/**
 * Agendamentos futuros × templates WABA (pin + exclusão programada).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { SentinelaTemplateCategory } from "./metaTemplateProduct.ts";

const SAO_PAULO = "America/Sao_Paulo";

export type WabaTemplatePinColumn = "waba_confirmacao_template_id" | "waba_lembrete_template_id";

export function pinColumnForCategory(category: SentinelaTemplateCategory): WabaTemplatePinColumn {
  return category === "confirmacao" ? "waba_confirmacao_template_id" : "waba_lembrete_template_id";
}

export function reminderSentColumnForCategory(
  category: SentinelaTemplateCategory,
): "reminder_whatsapp_sent_at" | "reminder_3h_sent_at" {
  return category === "confirmacao" ? "reminder_whatsapp_sent_at" : "reminder_3h_sent_at";
}

export async function resolveBarbeariaIdsForBarbershop(
  serviceClient: SupabaseClient,
  barbershopId: string,
): Promise<string[]> {
  const { data: shop, error: shopErr } = await serviceClient
    .from("barbershops")
    .select("slug")
    .eq("id", barbershopId)
    .maybeSingle();

  if (shopErr) throw new Error(shopErr.message);
  const slug = String(shop?.slug ?? "").trim();
  if (!slug) return [];

  const { data: barbearias, error } = await serviceClient
    .from("barbearias")
    .select("id")
    .eq("slug", slug);

  if (error) throw new Error(error.message);
  return (barbearias ?? []).map((b) => String(b.id));
}

function saoPauloTodayYmd(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

function saoPauloNowHm(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SAO_PAULO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(reference);
}

/** Comparável para “último agendamento pendente” (data+hora em SP). */
export function appointmentSortKey(data: string, hora: string): string {
  return `${data.slice(0, 10)}T${hora.slice(0, 5)}`;
}

export function isAppointmentInFuture(data: string, hora: string, reference = new Date()): boolean {
  const d = data.slice(0, 10);
  const today = saoPauloTodayYmd(reference);
  if (d > today) return true;
  if (d < today) return false;
  return hora.slice(0, 5) > saoPauloNowHm(reference);
}

type AgRow = {
  id: string;
  data: string;
  hora: string;
  status: string;
  requires_client_confirmation: boolean | null;
  client_confirmed_at: string | null;
  reminder_whatsapp_sent_at: string | null;
  reminder_3h_sent_at: string | null;
  waba_confirmacao_template_id: string | null;
  waba_lembrete_template_id: string | null;
};

function rowQualifiesForCategoryPending(row: AgRow, category: SentinelaTemplateCategory): boolean {
  if (!isAppointmentInFuture(row.data, row.hora)) return false;
  if (row.status !== "confirmado") return false;

  if (category === "confirmacao") {
    if (row.reminder_whatsapp_sent_at) return false;
    if (!row.requires_client_confirmation) return false;
    if (row.client_confirmed_at) return false;
    return true;
  }

  if (row.reminder_3h_sent_at) return false;
  return true;
}

/** Agendamentos elegíveis a pin na exclusão (ainda sem pin ou pin = template). */
export async function listUnpinnedEligibleAppointments(
  serviceClient: SupabaseClient,
  barbershopId: string,
  category: SentinelaTemplateCategory,
): Promise<AgRow[]> {
  const barbeariaIds = await resolveBarbeariaIdsForBarbershop(serviceClient, barbershopId);
  if (barbeariaIds.length === 0) return [];

  const { data, error } = await serviceClient
    .from("agendamentos")
    .select(
      "id, data, hora, status, requires_client_confirmation, client_confirmed_at, reminder_whatsapp_sent_at, reminder_3h_sent_at, waba_confirmacao_template_id, waba_lembrete_template_id",
    )
    .in("barbearia_id", barbeariaIds);

  if (error) throw new Error(error.message);

  return ((data ?? []) as AgRow[]).filter((row) => {
    if (!rowQualifiesForCategoryPending(row, category)) return false;
    const pin = category === "confirmacao" ? row.waba_confirmacao_template_id : row.waba_lembrete_template_id;
    return pin == null;
  });
}

export async function pinAppointmentsToTemplate(
  serviceClient: SupabaseClient,
  appointmentIds: string[],
  templateId: string,
  category: SentinelaTemplateCategory,
): Promise<void> {
  if (appointmentIds.length === 0) return;
  const pinCol = pinColumnForCategory(category);
  const { error } = await serviceClient
    .from("agendamentos")
    .update({ [pinCol]: templateId })
    .in("id", appointmentIds);
  if (error) throw new Error(error.message);
}

export async function countPinnedPendingForTemplate(
  serviceClient: SupabaseClient,
  templateId: string,
  category: SentinelaTemplateCategory,
): Promise<{ count: number; lastAppointmentAt: string | null }> {
  const pinCol = pinColumnForCategory(category);
  const { data, error } = await serviceClient
    .from("agendamentos")
    .select(
      "id, data, hora, status, requires_client_confirmation, client_confirmed_at, reminder_whatsapp_sent_at, reminder_3h_sent_at, waba_confirmacao_template_id, waba_lembrete_template_id",
    )
    .eq(pinCol, templateId);

  if (error) throw new Error(error.message);

  let lastKey: string | null = null;
  let count = 0;

  for (const row of (data ?? []) as AgRow[]) {
    if (!rowQualifiesForCategoryPending(row, category)) continue;
    count += 1;
    const key = appointmentSortKey(row.data, row.hora);
    if (!lastKey || key > lastKey) lastKey = key;
  }

  return {
    count,
    lastAppointmentAt: lastKey ? `${lastKey.slice(0, 10)}T${lastKey.slice(11)}:00-03:00` : null,
  };
}
