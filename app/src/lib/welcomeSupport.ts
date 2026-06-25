import { supabase } from "@/integrations/supabase/client";

export const SUPPORT_HOME_PATH = "/app/suporte";
export const AGENDAMENTOS_HOME_PATH = "/app/agendamentos";

const PANEL_SESSION_KEY = "sentinela:panel-session";

export function isDefaultAppLandingPath(pathname: string) {
  return pathname === "/app" || pathname === AGENDAMENTOS_HOME_PATH;
}

/** PWA reaberto na sessão anterior em Configurações (manifest antigo ou restore do SO). */
export function isLegacyPwaColdStartSettingsPath(pathname: string) {
  return pathname === "/app/settings" || pathname.startsWith("/app/settings/");
}

export function markPanelSessionStarted() {
  try {
    sessionStorage.setItem(PANEL_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasPanelSessionStarted() {
  try {
    return sessionStorage.getItem(PANEL_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export async function markWelcomeSupportSeen(barbershopId: string) {
  const { error } = await supabase
    .from("barbershops")
    .update({ welcome_support_pending: false })
    .eq("id", barbershopId);

  return !error;
}
