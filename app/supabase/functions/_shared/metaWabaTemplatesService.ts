/**
 * Orquestração sync/link/create/resubmit de templates Meta por barbearia.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptWabaToken } from "./wabaCrypto.ts";
import { subscribeWabaToApp } from "./metaWabaConnect.ts";
import {
  createMessageTemplate,
  fetchApprovedUtilityTemplates,
  fetchMessageTemplateById,
  MetaGraphRequestError,
  updateMessageTemplate,
  type MetaMessageTemplateNode,
} from "./metaMessageTemplates.ts";
import {
  buildMetaTemplateComponents,
  generateMetaTemplateName,
  inferCategoryFromMetaTemplateName,
  mapGraphErrorToUserMessage,
  parseTemplateLanguage,
  resolveQuickReplyLabels,
  translateRejectionReason,
  DEFAULT_BODY_TEXT,
  normalizeMetaTemplateLanguage,
  type SentinelaTemplateCategory,
  type TemplateLanguage,
} from "./metaTemplateProduct.ts";

export type WabaTemplateRow = {
  id: string;
  barbershop_id: string;
  waba_id: string;
  sentinela_category: SentinelaTemplateCategory;
  meta_template_id: string | null;
  meta_template_name: string;
  language: string;
  meta_status: string;
  meta_category: string;
  body_display_text: string;
  quick_reply_labels: string[];
  meta_rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
};

export type MetaShopContext = {
  shopId: string;
  wabaId: string;
  accessToken: string;
  wabaConnected: boolean;
  provider: string;
};

export async function resolveMetaShopForOwner(
  serviceClient: SupabaseClient,
  ownerId: string,
): Promise<{ ok: true; ctx: MetaShopContext } | { ok: false; error: string; status: number }> {
  const { data: shop, error } = await serviceClient
    .from("barbershops")
    .select(
      "id, waba_id, waba_access_token_encrypted, waba_connect_status, whatsapp_messaging_provider",
    )
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!shop) return { ok: false, error: "Empresa não encontrada.", status: 404 };

  const provider = String(shop.whatsapp_messaging_provider ?? "").trim().toLowerCase();
  if (provider !== "meta") {
    return { ok: false, error: "Templates disponíveis apenas com WhatsApp Meta Direct.", status: 422 };
  }

  if (String(shop.waba_connect_status ?? "") !== "connected") {
    return {
      ok: false,
      error: "WhatsApp não está conectado. Reconecte em Integrações para gerenciar templates.",
      status: 422,
    };
  }

  const wabaId = String(shop.waba_id ?? "").trim();
  const encrypted = String(shop.waba_access_token_encrypted ?? "").trim();
  if (!wabaId || !encrypted) {
    return {
      ok: false,
      error: "Dados da conexão Meta incompletos. Reconecte o WhatsApp.",
      status: 422,
    };
  }

  let accessToken: string;
  try {
    accessToken = await decryptWabaToken(encrypted);
  } catch {
    return { ok: false, error: "Não foi possível usar o token Meta salvo. Reconecte o WhatsApp.", status: 500 };
  }

  return {
    ok: true,
    ctx: {
      shopId: shop.id,
      wabaId,
      accessToken,
      wabaConnected: true,
      provider,
    },
  };
}

async function loadLocalTemplates(
  serviceClient: SupabaseClient,
  shopId: string,
): Promise<WabaTemplateRow[]> {
  const { data, error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .select("*")
    .eq("barbershop_id", shopId);

  if (error) throw new Error(error.message);
  return (data ?? []) as WabaTemplateRow[];
}

function serializeSlot(row: WabaTemplateRow | null, wabaIdCurrent: string) {
  if (!row) {
    return { linked: null, can_create: true, needs_reconnect: false };
  }

  const needsReconnect = row.waba_id !== wabaIdCurrent;

  return {
    linked: {
      id: row.id,
      sentinela_category: row.sentinela_category,
      meta_template_id: row.meta_template_id,
      meta_template_name: row.meta_template_name,
      language: row.language,
      meta_status: row.meta_status,
      body_display_text: row.body_display_text,
      quick_reply_labels: row.quick_reply_labels,
      meta_rejection_reason: row.meta_rejection_reason,
      rejection_user_message: row.meta_status === "REJECTED"
        ? translateRejectionReason(row.meta_rejection_reason)
        : null,
      waba_id: row.waba_id,
      needs_reconnect: needsReconnect,
      last_synced_at: row.last_synced_at,
    },
    can_create: row.meta_status === "REJECTED",
    needs_reconnect: needsReconnect,
  };
}

async function refreshLocalFromMeta(
  serviceClient: SupabaseClient,
  accessToken: string,
  row: WabaTemplateRow,
): Promise<WabaTemplateRow> {
  if (!row.meta_template_id) return row;

  const remote = await fetchMessageTemplateById(accessToken, row.meta_template_id);
  if (!remote?.status) return row;

  const now = new Date().toISOString();
  const patch: Partial<WabaTemplateRow> = {
    meta_status: String(remote.status),
    last_synced_at: now,
    updated_at: now,
  };

  if (remote.status === "REJECTED" && remote.rejected_reason) {
    patch.meta_rejection_reason = String(remote.rejected_reason);
  } else if (remote.status === "APPROVED") {
    patch.meta_rejection_reason = null;
  }

  const { data, error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .update(patch)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as WabaTemplateRow;
}

/** Best-effort: inclui message_template_status_update para WABAs já conectadas antes desta feature. */
export async function ensureTemplateWebhookSubscription(
  accessToken: string,
  wabaId: string,
): Promise<void> {
  try {
    await subscribeWabaToApp(accessToken, wabaId);
  } catch (e) {
    console.warn("[metaWabaTemplates] subscribe best-effort falhou:", e);
  }
}

export async function syncWabaTemplates(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
): Promise<Record<string, unknown>> {
  await ensureTemplateWebhookSubscription(ctx.accessToken, ctx.wabaId);

  let localRows = await loadLocalTemplates(serviceClient, ctx.shopId);

  localRows = await Promise.all(
    localRows.map((row) => refreshLocalFromMeta(serviceClient, ctx.accessToken, row)),
  );

  const approvedRemote = await fetchApprovedUtilityTemplates(ctx.accessToken, ctx.wabaId);
  const linkedIds = new Set(localRows.map((r) => r.meta_template_id).filter(Boolean));

  const unlinkedApproved = approvedRemote
    .filter((t) => t.id && !linkedIds.has(String(t.id)))
    .map((t) => ({
      meta_template_id: String(t.id),
      meta_template_name: String(t.name ?? ""),
      language: normalizeMetaTemplateLanguage(String(t.language ?? "pt_BR")),
      meta_status: String(t.status ?? "APPROVED"),
      inferred_category: inferCategoryFromMetaTemplateName(String(t.name ?? "")),
    }));

  const byCategory = (cat: SentinelaTemplateCategory) =>
    localRows.find((r) => r.sentinela_category === cat) ?? null;

  return {
    ok: true,
    waba_id: ctx.wabaId,
    slots: {
      confirmacao: serializeSlot(byCategory("confirmacao"), ctx.wabaId),
      lembrete: serializeSlot(byCategory("lembrete"), ctx.wabaId),
    },
    meta_approved_unlinked: unlinkedApproved,
    pending_local: localRows
      .filter((r) => r.meta_status === "PENDING" || r.meta_status === "IN_APPEAL")
      .map((r) => ({
        id: r.id,
        sentinela_category: r.sentinela_category,
        meta_status: r.meta_status,
      })),
  };
}

export async function linkWabaTemplate(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  input: {
    meta_template_id: string;
    meta_template_name: string;
    language: string;
    sentinela_category: SentinelaTemplateCategory;
    body_display_text?: string;
    quick_reply_labels?: string[];
  },
): Promise<Record<string, unknown>> {
  const language = parseTemplateLanguage(input.language) ??
    normalizeMetaTemplateLanguage(input.language);

  const existing = await loadLocalTemplates(serviceClient, ctx.shopId);
  const slotRow = existing.find((r) => r.sentinela_category === input.sentinela_category);
  if (slotRow && slotRow.meta_status !== "REJECTED") {
    return { ok: false, error: "Este slot já possui um template vinculado." };
  }

  const remote = await fetchMessageTemplateById(ctx.accessToken, input.meta_template_id);
  if (!remote) return { ok: false, error: "Template não encontrado na Meta." };

  const now = new Date().toISOString();
  const bodyDisplay = input.body_display_text?.trim() ||
    slotRow?.body_display_text ||
    DEFAULT_BODY_TEXT[input.sentinela_category][language];

  const quickLabels = input.quick_reply_labels ?? slotRow?.quick_reply_labels ?? [];

  const payload = {
    barbershop_id: ctx.shopId,
    waba_id: ctx.wabaId,
    sentinela_category: input.sentinela_category,
    meta_template_id: String(remote.id ?? input.meta_template_id),
    meta_template_name: String(remote.name ?? input.meta_template_name),
    language,
    meta_status: String(remote.status ?? "APPROVED"),
    meta_category: "UTILITY",
    body_display_text: bodyDisplay || " ",
    quick_reply_labels: quickLabels,
    meta_rejection_reason: remote.rejected_reason ? String(remote.rejected_reason) : null,
    last_synced_at: now,
    updated_at: now,
  };

  if (slotRow) {
    const { error } = await serviceClient
      .from("whatsapp_waba_message_templates")
      .update(payload)
      .eq("id", slotRow.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await serviceClient.from("whatsapp_waba_message_templates").insert({
      ...payload,
      created_at: now,
    });
    if (error) return { ok: false, error: error.message };
  }

  return syncWabaTemplates(serviceClient, ctx);
}

export async function createOrResubmitWabaTemplate(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  input: {
    sentinela_category: SentinelaTemplateCategory;
    body_display_text: string;
    language: string;
    enabled_button_ids: string[];
  },
): Promise<Record<string, unknown>> {
  const language = parseTemplateLanguage(input.language);
  if (!language) return { ok: false, error: "Idioma inválido." };

  const existing = await loadLocalTemplates(serviceClient, ctx.shopId);
  const slotRow = existing.find((r) => r.sentinela_category === input.sentinela_category);

  if (slotRow && (slotRow.meta_status === "APPROVED" || slotRow.meta_status === "PENDING" || slotRow.meta_status === "IN_APPEAL")) {
    return {
      ok: false,
      error: slotRow.meta_status === "APPROVED"
        ? "Já existe um template aprovado nesta categoria."
        : "Há um template em análise nesta categoria. Aguarde a resposta da Meta.",
    };
  }

  const templateName = slotRow?.meta_template_name ??
    generateMetaTemplateName(input.sentinela_category, ctx.shopId);

  let components;
  try {
    components = buildMetaTemplateComponents(
      input.body_display_text,
      language,
      input.sentinela_category,
      input.enabled_button_ids,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const quickLabels = resolveQuickReplyLabels(
    input.sentinela_category,
    language,
    input.enabled_button_ids,
  );

  const now = new Date().toISOString();

  try {
    if (slotRow?.meta_template_id && slotRow.meta_status === "REJECTED") {
      await updateMessageTemplate(ctx.accessToken, slotRow.meta_template_id, {
        category: "UTILITY",
        components,
      });

      const { error } = await serviceClient
        .from("whatsapp_waba_message_templates")
        .update({
          waba_id: ctx.wabaId,
          language,
          meta_status: "PENDING",
          body_display_text: input.body_display_text,
          quick_reply_labels: quickLabels,
          meta_rejection_reason: null,
          last_synced_at: now,
          updated_at: now,
        })
        .eq("id", slotRow.id);

      if (error) return { ok: false, error: error.message };
    } else {
      const created = await createMessageTemplate(ctx.accessToken, ctx.wabaId, {
        name: templateName,
        language,
        category: "UTILITY",
        components,
      });

      const insertPayload = {
        barbershop_id: ctx.shopId,
        waba_id: ctx.wabaId,
        sentinela_category: input.sentinela_category,
        meta_template_id: created.id,
        meta_template_name: templateName,
        language,
        meta_status: created.status ?? "PENDING",
        meta_category: "UTILITY",
        body_display_text: input.body_display_text,
        quick_reply_labels: quickLabels,
        meta_rejection_reason: null,
        last_synced_at: now,
        updated_at: now,
        created_at: now,
      };

      if (slotRow) {
        const { error } = await serviceClient
          .from("whatsapp_waba_message_templates")
          .update(insertPayload)
          .eq("id", slotRow.id);
        if (error) return { ok: false, error: error.message };
      } else {
        const { error } = await serviceClient.from("whatsapp_waba_message_templates").insert(insertPayload);
        if (error) return { ok: false, error: error.message };
      }
    }
  } catch (e) {
    if (e instanceof MetaGraphRequestError) {
      return {
        ok: false,
        error: mapGraphErrorToUserMessage(e.status, e.userMessage, e.metaCode),
      };
    }
    throw e;
  }

  return syncWabaTemplates(serviceClient, ctx);
}

export async function applyTemplateStatusWebhook(
  serviceClient: SupabaseClient,
  wabaId: string,
  value: Record<string, unknown>,
): Promise<void> {
  const event = String(value.event ?? "").toUpperCase();
  const templateId = value.message_template_id != null ? String(value.message_template_id) : null;
  const templateName = value.message_template_name != null ? String(value.message_template_name) : null;
  const language = value.message_template_language != null ? String(value.message_template_language) : null;
  const reason = value.reason != null ? String(value.reason) : null;

  if (!event) return;

  const now = new Date().toISOString();

  let query = serviceClient
    .from("whatsapp_waba_message_templates")
    .update({
      meta_status: event,
      updated_at: now,
      last_synced_at: now,
      meta_rejection_reason: event === "REJECTED" ? (reason ?? "UNKNOWN") : null,
    })
    .eq("waba_id", wabaId);

  if (templateId) {
    query = query.eq("meta_template_id", templateId);
  } else if (templateName && language) {
    query = query.eq("meta_template_name", templateName).eq("language", language);
  } else {
    return;
  }

  const { error } = await query;
  if (error) {
    console.error("[metaWabaTemplates] webhook status update falhou:", error.message);
  }

  if (event === "APPROVED" && templateName) {
    const inferred = inferCategoryFromMetaTemplateName(templateName);
    if (inferred) {
      await serviceClient
        .from("whatsapp_waba_message_templates")
        .update({ sentinela_category: inferred, updated_at: now })
        .eq("waba_id", wabaId)
        .eq("meta_template_name", templateName)
        .is("sentinela_category", null);
    }
  }
}

export function tryAutoLinkApprovedTemplates(
  approved: MetaMessageTemplateNode[],
  localRows: WabaTemplateRow[],
): Array<{ category: SentinelaTemplateCategory; template: MetaMessageTemplateNode }> {
  const occupied = new Set(localRows.map((r) => r.sentinela_category));
  const suggestions: Array<{ category: SentinelaTemplateCategory; template: MetaMessageTemplateNode }> = [];

  for (const t of approved) {
    const cat = inferCategoryFromMetaTemplateName(String(t.name ?? ""));
    if (!cat || occupied.has(cat)) continue;
    suggestions.push({ category: cat, template: t });
    occupied.add(cat);
  }

  return suggestions;
}
