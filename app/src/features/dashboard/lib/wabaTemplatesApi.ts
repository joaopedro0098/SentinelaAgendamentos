import { supabase } from "@/integrations/supabase/client";
import type { SentinelaTemplateCategory, TemplateLanguage } from "@/features/dashboard/lib/metaTemplateProduct";

export type LinkedTemplateSlot = {
  id: string;
  sentinela_category: SentinelaTemplateCategory;
  meta_template_id: string | null;
  meta_template_name: string;
  language: string;
  meta_status: string;
  body_display_text: string;
  quick_reply_labels: string[];
  meta_rejection_reason: string | null;
  rejection_user_message: string | null;
  waba_id: string;
  needs_reconnect: boolean;
  last_synced_at: string | null;
};

export type TemplateSlotState = {
  linked: LinkedTemplateSlot | null;
  can_create: boolean;
  needs_reconnect: boolean;
};

export type UnlinkedApprovedTemplate = {
  meta_template_id: string;
  meta_template_name: string;
  language: string;
  meta_status: string;
  inferred_category: SentinelaTemplateCategory | null;
};

export type WabaTemplatesSyncResult =
  | {
      ok: true;
      waba_id: string;
      slots: {
        confirmacao: TemplateSlotState;
        lembrete: TemplateSlotState;
      };
      meta_approved_unlinked: UnlinkedApprovedTemplate[];
      pending_local: { id: string; sentinela_category: SentinelaTemplateCategory; meta_status: string }[];
    }
  | { ok: false; error: string };

function parseFnError(error: unknown, data: unknown): string {
  if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  if (error instanceof Error) return error.message;
  return "Falha na comunicação com o servidor.";
}

async function invokeTemplates(body: Record<string, unknown>): Promise<WabaTemplatesSyncResult> {
  const { data, error } = await supabase.functions.invoke("meta-waba-message-templates", { body });

  if (error) {
    return { ok: false, error: parseFnError(error, data) };
  }

  const result = data as WabaTemplatesSyncResult & { error?: string };
  if (result && typeof result === "object" && "ok" in result && result.ok === false) {
    return { ok: false, error: result.error ?? "Operação falhou." };
  }

  return result as WabaTemplatesSyncResult;
}

export async function syncWabaMessageTemplates(): Promise<WabaTemplatesSyncResult> {
  return invokeTemplates({ action: "sync" });
}

export async function linkWabaMessageTemplate(payload: {
  meta_template_id: string;
  meta_template_name: string;
  language: string;
  sentinela_category: SentinelaTemplateCategory;
}): Promise<WabaTemplatesSyncResult> {
  return invokeTemplates({ action: "link", ...payload });
}

export async function createWabaMessageTemplate(payload: {
  sentinela_category: SentinelaTemplateCategory;
  body_display_text: string;
  language: TemplateLanguage;
  enabled_button_ids: string[];
}): Promise<WabaTemplatesSyncResult> {
  return invokeTemplates({ action: "create", ...payload });
}

export async function resubmitWabaMessageTemplate(payload: {
  sentinela_category: SentinelaTemplateCategory;
  body_display_text: string;
  language: TemplateLanguage;
  enabled_button_ids: string[];
}): Promise<WabaTemplatesSyncResult> {
  return invokeTemplates({ action: "resubmit", ...payload });
}
