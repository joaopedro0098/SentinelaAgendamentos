import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const MAX_WABA_TEMPLATES_PER_BARBERSHOP = 5;
export const MAX_META_TEMPLATE_CREATIONS_PER_HOUR_PER_WABA = 10;

const CREATION_WINDOW_MS = 60 * 60 * 1000;

export async function countBarbershopWabaTemplates(
  serviceClient: SupabaseClient,
  shopId: string,
): Promise<number> {
  const { count, error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .select("id", { count: "exact", head: true })
    .eq("barbershop_id", shopId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Bloqueia novo INSERT local quando a barbearia já atingiu o teto (reenvio/update não conta). */
export async function assertBarbershopTemplateCapacity(
  serviceClient: SupabaseClient,
  shopId: string,
  isNewLocalRow: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isNewLocalRow) return { ok: true };

  const total = await countBarbershopWabaTemplates(serviceClient, shopId);
  if (total >= MAX_WABA_TEMPLATES_PER_BARBERSHOP) {
    return {
      ok: false,
      error:
        `Esta barbearia já atingiu o limite de ${MAX_WABA_TEMPLATES_PER_BARBERSHOP} templates. Exclua um template existente antes de criar outro.`,
    };
  }
  return { ok: true };
}

/** Throttle interno Sentinela: 10 POSTs/hora por waba_id (independente entre WABAs). */
export async function assertWabaTemplateCreationRate(
  serviceClient: SupabaseClient,
  wabaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const since = new Date(Date.now() - CREATION_WINDOW_MS).toISOString();

  const { count, error } = await serviceClient
    .from("meta_waba_template_creation_events")
    .select("id", { count: "exact", head: true })
    .eq("waba_id", wabaId)
    .gte("created_at", since);

  if (error) throw new Error(error.message);

  if ((count ?? 0) >= MAX_META_TEMPLATE_CREATIONS_PER_HOUR_PER_WABA) {
    return {
      ok: false,
      error: "Muitos templates criados recentemente nesta conta WhatsApp, aguarde para tentar novamente.",
    };
  }
  return { ok: true };
}

export async function recordMetaTemplateCreation(
  serviceClient: SupabaseClient,
  wabaId: string,
): Promise<void> {
  const { error } = await serviceClient.from("meta_waba_template_creation_events").insert({
    waba_id: wabaId,
  });
  if (error) {
    console.error("[metaTemplateLimits] falha ao registrar criação:", error.message);
  }
}
