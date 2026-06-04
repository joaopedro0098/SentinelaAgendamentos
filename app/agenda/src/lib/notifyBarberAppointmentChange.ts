import { supabase } from "@/integrations/supabase/client";

export type BarberAppointmentChangeEvent = "cancelled" | "rescheduled";

export async function notifyBarberAppointmentChange(payload: {
  agendamento_id: string;
  event: BarberAppointmentChangeEvent;
  old_data?: string;
  new_data?: string;
}) {
  const { data, error } = await supabase.functions.invoke("notify-barber-appointment-change", {
    body: payload,
  });

  if (error) {
    console.error("notify-barber-appointment-change:", error.message);
    return false;
  }

  const body = data as { error?: string; ok?: boolean } | null;
  if (body?.error) {
    console.error("notify-barber-appointment-change:", body.error);
    return false;
  }

  return true;
}
