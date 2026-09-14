/**
 * Orquestração sync/link/create/resubmit/select/delete de templates Meta por barbearia.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptWabaToken } from "./wabaCrypto.ts";
import { subscribeWabaToApp } from "./metaWabaConnect.ts";
import {
  createMessageTemplate,
  deleteMessageTemplateByName,
  fetchApprovedUtilityTemplates,
  fetchMessageTemplateById,
  MetaGraphRequestError,
  updateMessageTemplate,
  type MetaMessageTemplateNode,
} from "./metaMessageTemplates.ts";
import {
  assertBarbershopTemplateCapacity,
  assertWabaTemplateCreationRate,
  recordMetaTemplateCreation,
} from "./metaTemplateLimits.ts";
import {
  countPinnedPendingForTemplate,
  listUnpinnedEligibleAppointments,
  pinAppointmentsToTemplate,
} from "./metaWabaTemplateAppointments.ts";
import {
  allocateMetaTemplateName,
  buildMetaTemplateComponents,
  inferCategoryFromMetaTemplateName,
  mapGraphErrorToUserMessage,
  parseTemplateLanguage,
  resolveQuickReplyLabels,
  translateRejectionReason,
  validateMetaTemplateName,
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
  is_selected: boolean;
  deletion_pending_at: string | null;
  deletion_last_appointment_at: string | null;
  deletion_meta_error: string | null;
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

export type SerializedWabaTemplate = {
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
  is_selected: boolean;
  deletion_pending_at: string | null;
  deletion_last_appointment_at: string | null;
  deletion_meta_error: string | null;
  pending_appointment_count: number;
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
    .eq("barbershop_id", shopId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as WabaTemplateRow[];
}

async function getTemplateById(
  serviceClient: SupabaseClient,
  shopId: string,
  templateId: string,
): Promise<WabaTemplateRow | null> {
  const { data, error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .select("*")
    .eq("barbershop_id", shopId)
    .eq("id", templateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as WabaTemplateRow | null) ?? null;
}

function categoryHasPendingReview(rows: WabaTemplateRow[], category: SentinelaTemplateCategory): boolean {
  return rows.some(
    (r) =>
      r.sentinela_category === category &&
      (r.meta_status === "PENDING" || r.meta_status === "IN_APPEAL"),
  );
}

async function serializeTemplate(
  serviceClient: SupabaseClient,
  row: WabaTemplateRow,
  wabaIdCurrent: string,
): Promise<SerializedWabaTemplate> {
  const needsReconnect = row.waba_id !== wabaIdCurrent;
  let pendingCount = 0;
  if (row.deletion_pending_at) {
    const pending = await countPinnedPendingForTemplate(
      serviceClient,
      row.id,
      row.sentinela_category,
    );
    pendingCount = pending.count;
  }

  return {
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
    is_selected: Boolean(row.is_selected),
    deletion_pending_at: row.deletion_pending_at,
    deletion_last_appointment_at: row.deletion_last_appointment_at,
    deletion_meta_error: row.deletion_meta_error,
    pending_appointment_count: pendingCount,
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

async function executeMetaAndLocalDelete(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  row: WabaTemplateRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nameError = validateMetaTemplateName(row.meta_template_name);
  if (nameError) return { ok: false, error: nameError };

  try {
    await deleteMessageTemplateByName(ctx.accessToken, ctx.wabaId, row.meta_template_name);
  } catch (e) {
    if (e instanceof MetaGraphRequestError) {
      if (e.status !== 404) {
        const msg = mapGraphErrorToUserMessage(e.status, e.userMessage, e.metaCode);
        await serviceClient
          .from("whatsapp_waba_message_templates")
          .update({ deletion_meta_error: msg, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return { ok: false, error: msg };
      }
    } else {
      throw e;
    }
  }

  const { error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .delete()
    .eq("id", row.id)
    .eq("barbershop_id", ctx.shopId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function tryCompleteScheduledTemplateDeletion(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  row: WabaTemplateRow,
): Promise<void> {
  if (!row.deletion_pending_at) return;

  const pending = await countPinnedPendingForTemplate(
    serviceClient,
    row.id,
    row.sentinela_category,
  );

  const now = new Date().toISOString();

  if (pending.count > 0) {
    await serviceClient
      .from("whatsapp_waba_message_templates")
      .update({
        deletion_last_appointment_at: pending.lastAppointmentAt,
        updated_at: now,
      })
      .eq("id", row.id);
    return;
  }

  await executeMetaAndLocalDelete(serviceClient, ctx, row);
}

export async function finalizePendingTemplateDeletionsGlobal(
  serviceClient: SupabaseClient,
): Promise<void> {
  const { data: pendingRows, error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .select("*")
    .not("deletion_pending_at", "is", null);

  if (error) {
    console.error("[metaWabaTemplates] finalize pending list:", error.message);
    return;
  }

  for (const row of (pendingRows ?? []) as WabaTemplateRow[]) {
    const shopResult = await resolveShopContextForBarbershop(serviceClient, row.barbershop_id);
    if (!shopResult.ok) continue;
    try {
      await tryCompleteScheduledTemplateDeletion(serviceClient, shopResult.ctx, row);
    } catch (e) {
      console.error("[metaWabaTemplates] finalize pending:", e);
    }
  }
}

async function resolveShopContextForBarbershop(
  serviceClient: SupabaseClient,
  shopId: string,
): Promise<{ ok: true; ctx: MetaShopContext } | { ok: false }> {
  const { data: shop, error } = await serviceClient
    .from("barbershops")
    .select(
      "id, owner_id, waba_id, waba_access_token_encrypted, waba_connect_status, whatsapp_messaging_provider",
    )
    .eq("id", shopId)
    .maybeSingle();

  if (error || !shop) return { ok: false };
  if (String(shop.whatsapp_messaging_provider ?? "").toLowerCase() !== "meta") return { ok: false };
  if (String(shop.waba_connect_status ?? "") !== "connected") return { ok: false };

  const wabaId = String(shop.waba_id ?? "").trim();
  const encrypted = String(shop.waba_access_token_encrypted ?? "").trim();
  if (!wabaId || !encrypted) return { ok: false };

  let accessToken: string;
  try {
    accessToken = await decryptWabaToken(encrypted);
  } catch {
    return { ok: false };
  }

  return {
    ok: true,
    ctx: {
      shopId: shop.id,
      wabaId,
      accessToken,
      wabaConnected: true,
      provider: "meta",
    },
  };
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

async function buildSyncPayload(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  localRows: WabaTemplateRow[],
  unlinkedApproved: Record<string, unknown>[],
): Promise<Record<string, unknown>> {
  const serialized = await Promise.all(
    localRows.map((row) => serializeTemplate(serviceClient, row, ctx.wabaId)),
  );

  const canCreate = (cat: SentinelaTemplateCategory) =>
    !categoryHasPendingReview(localRows, cat);

  return {
    ok: true,
    waba_id: ctx.wabaId,
    templates: serialized,
    can_create_by_category: {
      confirmacao: canCreate("confirmacao"),
      lembrete: canCreate("lembrete"),
    },
    meta_approved_unlinked: unlinkedApproved,
  };
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

  for (const row of localRows) {
    if (row.deletion_pending_at) {
      await tryCompleteScheduledTemplateDeletion(serviceClient, ctx, row);
    }
  }

  localRows = await loadLocalTemplates(serviceClient, ctx.shopId);

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

  return buildSyncPayload(serviceClient, ctx, localRows, unlinkedApproved);
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
  if (existing.some((r) => r.meta_template_id === input.meta_template_id)) {
    return { ok: false, error: "Este template já está vinculado." };
  }

  const remote = await fetchMessageTemplateById(ctx.accessToken, input.meta_template_id);
  if (!remote) return { ok: false, error: "Template não encontrado na Meta." };

  const resolvedName = String(remote.name ?? input.meta_template_name);
  const nameError = validateMetaTemplateName(resolvedName);
  if (nameError) return { ok: false, error: nameError };

  const capacity = await assertBarbershopTemplateCapacity(serviceClient, ctx.shopId, true);
  if (!capacity.ok) return capacity;

  const now = new Date().toISOString();
  const bodyDisplay = input.body_display_text?.trim() ||
    DEFAULT_BODY_TEXT[input.sentinela_category][language as TemplateLanguage];

  const quickLabels = input.quick_reply_labels ?? [];

  const { error } = await serviceClient.from("whatsapp_waba_message_templates").insert({
    barbershop_id: ctx.shopId,
    waba_id: ctx.wabaId,
    sentinela_category: input.sentinela_category,
    meta_template_id: String(remote.id ?? input.meta_template_id),
    meta_template_name: resolvedName,
    language,
    meta_status: String(remote.status ?? "APPROVED"),
    meta_category: "UTILITY",
    body_display_text: bodyDisplay || " ",
    quick_reply_labels: quickLabels,
    meta_rejection_reason: remote.rejected_reason ? String(remote.rejected_reason) : null,
    is_selected: false,
    last_synced_at: now,
    updated_at: now,
    created_at: now,
  });

  if (error) return { ok: false, error: error.message };

  return syncWabaTemplates(serviceClient, ctx);
}

export async function selectWabaTemplate(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  templateId: string,
): Promise<Record<string, unknown>> {
  const row = await getTemplateById(serviceClient, ctx.shopId, templateId);
  if (!row) return { ok: false, error: "Template não encontrado." };
  if (row.meta_status !== "APPROVED") {
    return { ok: false, error: "Só templates aprovados podem ser selecionados." };
  }
  if (row.deletion_pending_at) {
    return { ok: false, error: "Este template está em exclusão e não pode ser selecionado." };
  }

  const now = new Date().toISOString();

  await serviceClient
    .from("whatsapp_waba_message_templates")
    .update({ is_selected: false, updated_at: now })
    .eq("barbershop_id", ctx.shopId)
    .eq("sentinela_category", row.sentinela_category);

  const { error } = await serviceClient
    .from("whatsapp_waba_message_templates")
    .update({ is_selected: true, updated_at: now })
    .eq("id", templateId);

  if (error) return { ok: false, error: error.message };

  return syncWabaTemplates(serviceClient, ctx);
}

export async function createOrResubmitWabaTemplate(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  input: {
    template_id?: string;
    sentinela_category: SentinelaTemplateCategory;
    body_display_text: string;
    language: string;
    enabled_button_ids: string[];
  },
): Promise<Record<string, unknown>> {
  const language = parseTemplateLanguage(input.language);
  if (!language) return { ok: false, error: "Idioma inválido." };

  const existing = await loadLocalTemplates(serviceClient, ctx.shopId);

  let targetRow: WabaTemplateRow | null = null;
  if (input.template_id) {
    targetRow = await getTemplateById(serviceClient, ctx.shopId, input.template_id);
    if (!targetRow) return { ok: false, error: "Template não encontrado." };
    if (targetRow.sentinela_category !== input.sentinela_category) {
      return { ok: false, error: "Categoria não confere com o template." };
    }
  }

  if (!targetRow && categoryHasPendingReview(existing, input.sentinela_category)) {
    return {
      ok: false,
      error: "Há um template em análise nesta categoria. Aguarde a resposta da Meta.",
    };
  }

  const isResubmit = Boolean(targetRow?.meta_template_id && targetRow.meta_status === "REJECTED");
  const isNewLocalRow = !targetRow;

  const existingNames = existing.map((r) => r.meta_template_name);
  const templateName = targetRow?.meta_template_name ??
    allocateMetaTemplateName(input.sentinela_category, ctx.shopId, existingNames);

  const nameError = validateMetaTemplateName(templateName);
  if (nameError) return { ok: false, error: nameError };

  if (!isResubmit) {
    const capacity = await assertBarbershopTemplateCapacity(serviceClient, ctx.shopId, isNewLocalRow);
    if (!capacity.ok) return capacity;

    const rate = await assertWabaTemplateCreationRate(serviceClient, ctx.wabaId);
    if (!rate.ok) return rate;
  }

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
    if (isResubmit && targetRow) {
      await updateMessageTemplate(ctx.accessToken, targetRow.meta_template_id!, {
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
          is_selected: false,
          last_synced_at: now,
          updated_at: now,
        })
        .eq("id", targetRow.id);

      if (error) return { ok: false, error: error.message };
    } else {
      const created = await createMessageTemplate(ctx.accessToken, ctx.wabaId, {
        name: templateName,
        language,
        category: "UTILITY",
        components,
      });

      await recordMetaTemplateCreation(serviceClient, ctx.wabaId);

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
        is_selected: false,
        last_synced_at: now,
        updated_at: now,
        created_at: now,
      };

      const { error } = await serviceClient.from("whatsapp_waba_message_templates").insert(insertPayload);
      if (error) return { ok: false, error: error.message };
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

export async function deleteWabaTemplate(
  serviceClient: SupabaseClient,
  ctx: MetaShopContext,
  templateId: string,
): Promise<Record<string, unknown>> {
  const row = await getTemplateById(serviceClient, ctx.shopId, templateId);
  if (!row) {
    return { ok: false, error: "Template não encontrado." };
  }

  if (row.meta_status === "PENDING" || row.meta_status === "IN_APPEAL") {
    return {
      ok: false,
      error: "Não é possível excluir um template enquanto a Meta ainda está analisando.",
    };
  }

  if (row.deletion_pending_at) {
    return { ok: false, error: "Este template já está em exclusão programada." };
  }

  const now = new Date().toISOString();

  if (row.is_selected) {
    const eligible = await listUnpinnedEligibleAppointments(
      serviceClient,
      ctx.shopId,
      row.sentinela_category,
    );
    if (eligible.length > 0) {
      await pinAppointmentsToTemplate(
        serviceClient,
        eligible.map((a) => a.id),
        row.id,
        row.sentinela_category,
      );
    }
  }

  const pending = await countPinnedPendingForTemplate(
    serviceClient,
    row.id,
    row.sentinela_category,
  );

  if (pending.count > 0) {
    await serviceClient
      .from("whatsapp_waba_message_templates")
      .update({
        is_selected: false,
        deletion_pending_at: now,
        deletion_last_appointment_at: pending.lastAppointmentAt,
        deletion_meta_error: null,
        updated_at: now,
      })
      .eq("id", row.id);

    return syncWabaTemplates(serviceClient, ctx);
  }

  const deleted = await executeMetaAndLocalDelete(serviceClient, ctx, row);
  if (!deleted.ok) return deleted;

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
}

export function tryAutoLinkApprovedTemplates(
  approved: MetaMessageTemplateNode[],
  localRows: WabaTemplateRow[],
): Array<{ category: SentinelaTemplateCategory; template: MetaMessageTemplateNode }> {
  const linkedMetaIds = new Set(localRows.map((r) => r.meta_template_id).filter(Boolean));
  const suggestions: Array<{ category: SentinelaTemplateCategory; template: MetaMessageTemplateNode }> = [];

  for (const t of approved) {
    if (!t.id || linkedMetaIds.has(String(t.id))) continue;
    const cat = inferCategoryFromMetaTemplateName(String(t.name ?? ""));
    if (!cat) continue;
    suggestions.push({ category: cat, template: t });
  }

  return suggestions;
}
