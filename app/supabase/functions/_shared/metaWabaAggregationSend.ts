/**
 * Resolução CT/CA para envio Meta: fallback bidirecional somente no par direto.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  sentinelaCategoryForWhatsAppTemplateKind,
  type WhatsAppOperationalTemplateKind,
} from "./metaTemplateProduct.ts";

export type BarbershopMessagingRow = {
  id: string;
  slug: string;
  owner_id: string;
  whatsapp_messaging_provider: string | null;
  waba_connect_status: string | null;
  waba_phone_number_id: string | null;
  waba_access_token_encrypted: string | null;
};

const SHOP_SELECT =
  "id, slug, owner_id, whatsapp_messaging_provider, waba_connect_status, waba_phone_number_id, waba_access_token_encrypted";

/** Regra 3 / 1 / 2 — escolhe a shop que envia (ids de shop, não barbearia). */
export function chooseMetaSendShopId(params: {
  selectedShopId: string;
  partnerShopId: string | null;
  selectedSendable: boolean;
  partnerSendable: boolean;
}): string | null {
  const { selectedShopId, partnerShopId, selectedSendable, partnerSendable } = params;
  if (selectedSendable) return selectedShopId;
  if (partnerSendable && partnerShopId) return partnerShopId;
  return null;
}

export function isMetaConnectedShop(shop: BarbershopMessagingRow | null | undefined): boolean {
  if (!shop?.id) return false;
  if (shop.whatsapp_messaging_provider !== "meta") return false;
  if (shop.waba_connect_status !== "connected") return false;
  if (!String(shop.waba_phone_number_id ?? "").trim()) return false;
  if (!String(shop.waba_access_token_encrypted ?? "").trim()) return false;
  return true;
}

export async function loadBarbershopRowByBarbeariaId(
  supabase: SupabaseClient,
  barbeariaId: string,
): Promise<BarbershopMessagingRow | null> {
  const { data: barbearia, error: barbeariaError } = await supabase
    .from("barbearias")
    .select("slug")
    .eq("id", barbeariaId)
    .maybeSingle();

  if (barbeariaError || !barbearia?.slug) return null;

  const { data: shop, error: shopError } = await supabase
    .from("barbershops")
    .select(SHOP_SELECT)
    .eq("slug", barbearia.slug)
    .maybeSingle();

  if (shopError || !shop?.id) return null;
  return shop as BarbershopMessagingRow;
}

async function loadBarbershopRowByOwnerId(
  supabase: SupabaseClient,
  ownerUserId: string,
): Promise<BarbershopMessagingRow | null> {
  const { data: shops, error } = await supabase
    .from("barbershops")
    .select(SHOP_SELECT)
    .eq("owner_id", ownerUserId);

  if (error || !shops?.length) return null;
  if (shops.length > 1) {
    console.warn(
      `[metaWabaAggregationSend] owner ${ownerUserId} tem ${shops.length} barbershops — par CT/CA ambíguo`,
    );
    return null;
  }
  return shops[0] as BarbershopMessagingRow;
}

type AggregatedLinkRow = {
  owner_user_id: string;
  aggregated_user_id: string | null;
};

async function loadActiveAggregatedLinkForCaOwner(
  supabase: SupabaseClient,
  caOwnerUserId: string,
): Promise<AggregatedLinkRow | null> {
  const { data, error } = await supabase
    .from("aggregated_accounts")
    .select("owner_user_id, aggregated_user_id")
    .eq("aggregated_user_id", caOwnerUserId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AggregatedLinkRow | null;
}

async function loadUniqueActiveAggregatedLinkForCtOwner(
  supabase: SupabaseClient,
  ctOwnerUserId: string,
): Promise<AggregatedLinkRow | null> {
  const { data, error } = await supabase
    .from("aggregated_accounts")
    .select("owner_user_id, aggregated_user_id")
    .eq("owner_user_id", ctOwnerUserId)
    .eq("status", "active");

  if (error) throw new Error(error.message);
  if (!data?.length) return null;
  if (data.length > 1) {
    console.warn(
      `[metaWabaAggregationSend] titular ${ctOwnerUserId} tem ${data.length} CAs ativas — fallback CT→CA omitido`,
    );
    return null;
  }
  return data[0] as AggregatedLinkRow;
}

/** Par direto CT↔CA; null se loja isolada ou par ambíguo. */
export async function resolveAggregatedPartnerShop(
  supabase: SupabaseClient,
  selectedShop: BarbershopMessagingRow,
): Promise<BarbershopMessagingRow | null> {
  const caLink = await loadActiveAggregatedLinkForCaOwner(supabase, selectedShop.owner_id);
  if (caLink?.owner_user_id) {
    return loadBarbershopRowByOwnerId(supabase, caLink.owner_user_id);
  }

  const ctLink = await loadUniqueActiveAggregatedLinkForCtOwner(supabase, selectedShop.owner_id);
  const aggregatedUserId = ctLink?.aggregated_user_id;
  if (!aggregatedUserId) return null;

  return loadBarbershopRowByOwnerId(supabase, aggregatedUserId);
}

export async function loadBarbershopIdsWithSelectedTemplateForKind(
  supabase: SupabaseClient,
  barbershopIds: string[],
  kind: WhatsAppOperationalTemplateKind,
): Promise<Set<string>> {
  const unique = [...new Set(barbershopIds.filter(Boolean))];
  const category = sentinelaCategoryForWhatsAppTemplateKind(kind);
  if (unique.length === 0 || !category) return new Set();

  const { data, error } = await supabase
    .from("whatsapp_waba_message_templates")
    .select("barbershop_id")
    .in("barbershop_id", unique)
    .eq("sentinela_category", category)
    .eq("is_selected", true)
    .eq("meta_status", "APPROVED")
    .is("deletion_pending_at", null);

  if (error) throw new Error(error.message);

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const id = String(row.barbershop_id ?? "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

export function isShopSendableForKind(
  shop: BarbershopMessagingRow | null | undefined,
  templateShopIds: Set<string>,
): boolean {
  if (!shop?.id) return false;
  if (!isMetaConnectedShop(shop)) return false;
  return templateShopIds.has(shop.id);
}

export async function resolveMetaSendShopIdForBarbearia(
  supabase: SupabaseClient,
  barbeariaId: string,
  kind: WhatsAppOperationalTemplateKind,
): Promise<string | null> {
  const selectedShop = await loadBarbershopRowByBarbeariaId(supabase, barbeariaId);
  if (!selectedShop) return null;

  const partnerShop = await resolveAggregatedPartnerShop(supabase, selectedShop);
  const shopIds = [selectedShop.id, partnerShop?.id].filter(Boolean) as string[];
  const templateShopIds = await loadBarbershopIdsWithSelectedTemplateForKind(
    supabase,
    shopIds,
    kind,
  );

  const selectedSendable = isShopSendableForKind(selectedShop, templateShopIds);
  const partnerSendable = isShopSendableForKind(partnerShop, templateShopIds);

  return chooseMetaSendShopId({
    selectedShopId: selectedShop.id,
    partnerShopId: partnerShop?.id ?? null,
    selectedSendable,
    partnerSendable,
  });
}

export async function barbeariaEntersMetaPipelineForKind(
  supabase: SupabaseClient,
  barbeariaId: string,
  kind: WhatsAppOperationalTemplateKind,
): Promise<boolean> {
  const selectedShop = await loadBarbershopRowByBarbeariaId(supabase, barbeariaId);
  if (!selectedShop) return false;

  if (isMetaConnectedShop(selectedShop)) return true;

  const partnerShop = await resolveAggregatedPartnerShop(supabase, selectedShop);
  if (!partnerShop) return false;

  const templateShopIds = await loadBarbershopIdsWithSelectedTemplateForKind(
    supabase,
    [partnerShop.id],
    kind,
  );
  return isShopSendableForKind(partnerShop, templateShopIds);
}
