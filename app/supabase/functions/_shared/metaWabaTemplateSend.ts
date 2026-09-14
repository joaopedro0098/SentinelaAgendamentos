/**
 * Resolução do template WABA selecionado (envio Meta — fase futura).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  sentinelaCategoryForWhatsAppTemplateKind,
  type SentinelaTemplateCategory,
  type WhatsAppOperationalTemplateKind,
} from "./metaTemplateProduct.ts";

export type SelectedWabaTemplate = {
  id: string;
  meta_template_id: string | null;
  meta_template_name: string;
  language: string;
  sentinela_category: SentinelaTemplateCategory;
};

/** Sem template selecionado/aprovado → null (não enviar, sem erro). */
export async function resolveSelectedWabaTemplateForKind(
  serviceClient: SupabaseClient,
  barbershopId: string,
  kind: WhatsAppOperationalTemplateKind,
): Promise<SelectedWabaTemplate | null> {
  const category = sentinelaCategoryForWhatsAppTemplateKind(kind);
  if (!category) return null;

  const { data, error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .select("id, meta_template_id, meta_template_name, language, sentinela_category")
    .eq("barbershop_id", barbershopId)
    .eq("sentinela_category", category)
    .eq("is_selected", true)
    .eq("meta_status", "APPROVED")
    .is("deletion_pending_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.meta_template_name) return null;

  return data as SelectedWabaTemplate;
}
