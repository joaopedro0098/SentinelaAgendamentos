import { supabase } from "@/integrations/supabase/client";

export type ProfessionalAccountCheck =
  | { status: "professional" }
  | { status: "patient_only" }
  | { status: "error"; message: string };

/** Usuário autenticado já possui barbershop (conta profissional). */
export async function checkProfessionalAccount(): Promise<ProfessionalAccountCheck> {
  const { data, error } = await supabase.rpc("get_my_subscription");
  if (error) {
    return { status: "error", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { status: "error", message: "Resposta inválida" };
  }
  const row = data as Record<string, unknown>;
  if (row.error === "no_shop") {
    return { status: "patient_only" };
  }
  if (row.error) {
    return { status: "error", message: String(row.error) };
  }
  return { status: "professional" };
}
