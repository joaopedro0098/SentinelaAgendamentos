import { supabase } from "@/integrations/supabase/client";

export async function syncAgendaFromSlug(slug: string | undefined) {
  if (!slug) return { error: null as null };
  const { error } = await supabase.rpc("ensure_agenda_from_barbershop_slug", { p_slug: slug });
  return { error };
}
