import { supabase } from "@/integrations/supabase/client";

export const SUPPORT_HOME_PATH = "/app/suporte";

export function isDefaultAppLandingPath(pathname: string) {
  return pathname === "/app" || pathname === "/app/agendamentos";
}

export async function markWelcomeSupportSeen(barbershopId: string) {
  const { error } = await supabase
    .from("barbershops")
    .update({ welcome_support_pending: false })
    .eq("id", barbershopId);

  return !error;
}
