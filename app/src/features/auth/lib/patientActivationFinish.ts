import { supabase } from "@/integrations/supabase/client";

export type PatientActivationFinishResult =
  | { ok: true; slug: string | null }
  | { ok: false; error: string };

export function buildPatientActivationLoginPath(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return "/login?role=patient";
  return `/login?role=patient&activation_token=${encodeURIComponent(trimmed)}`;
}

export async function finishPatientActivation(
  token: string,
  authUserId: string,
): Promise<PatientActivationFinishResult> {
  const { data, error } = await supabase.rpc("concluir_ativacao_paciente", {
    p_token: token,
    p_auth_user_id: authUserId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as { error?: string; success?: boolean; barbearia_slug?: string | null } | null;
  if (row?.error) {
    return { ok: false, error: row.error };
  }

  return { ok: true, slug: row?.barbearia_slug ?? null };
}
