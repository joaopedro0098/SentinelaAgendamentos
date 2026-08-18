import { supabase } from "@/integrations/supabase/client";

export type ProvisionProfessionalResult =
  | { ok: true }
  | { error: string; code?: string };

export async function provisionProfessionalAccount(
  shopName: string,
  displayName: string,
): Promise<ProvisionProfessionalResult> {
  const { data, error } = await supabase.rpc("provision_professional_account", {
    p_shop_name: shopName.trim(),
    p_display_name: displayName.trim(),
  });

  if (error) {
    return { error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  if (!row) {
    return { error: "Resposta inválida" };
  }
  if (row.error === "professional_account_exists") {
    return { error: "Você já possui uma conta profissional.", code: "professional_account_exists" };
  }
  if (row.error) {
    return { error: String(row.error) };
  }

  return { ok: true };
}
