/**
 * Envio operacional WhatsApp Meta Direct por barbearia (templates WABA selecionados).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptWabaToken } from "./wabaCrypto.ts";
import { resolveSelectedWabaTemplateForKind } from "./metaWabaTemplateSend.ts";
import { buildMetaTemplateBodyParameters } from "./metaTemplateSendVariables.ts";
import {
  sendMetaWhatsAppTemplateMessage,
  MetaWhatsappSendError,
  type MetaSendMessageStatus,
} from "./metaWhatsapp.ts";
import {
  sentinelaCategoryForWhatsAppTemplateKind,
  type WhatsAppOperationalTemplateKind,
} from "./metaTemplateProduct.ts";
import {
  barbeariaEntersMetaPipelineForKind,
  isMetaConnectedShop,
  loadBarbershopRowByBarbeariaId,
  resolveMetaSendShopIdForBarbearia,
  type BarbershopMessagingRow,
} from "./metaWabaAggregationSend.ts";

export type MetaSendTemplateResult = {
  externalMessageId: string;
  messageStatus?: MetaSendMessageStatus;
  provider: "meta";
  status: string;
  wabaTemplateId: string;
  barbershopId: string;
  sentinelaCategory: "confirmacao" | "lembrete";
};

type MetaShopSendContext = {
  barbershopId: string;
  phoneNumberId: string;
  accessToken: string;
};

async function resolveBarbershopIdForBarbearia(
  supabase: SupabaseClient,
  barbeariaId: string,
): Promise<string | null> {
  const { data: barbearia, error: barbeariaError } = await supabase
    .from("barbearias")
    .select("slug")
    .eq("id", barbeariaId)
    .maybeSingle();

  if (barbeariaError || !barbearia?.slug) return null;

  const { data: shop, error: shopError } = await supabase
    .from("barbershops")
    .select("id")
    .eq("slug", barbearia.slug)
    .maybeSingle();

  if (shopError || !shop?.id) return null;
  return shop.id;
}

async function loadMetaShopSendCredentials(
  supabase: SupabaseClient,
  shop: BarbershopMessagingRow,
): Promise<MetaShopSendContext | null> {
  if (!isMetaConnectedShop(shop)) return null;

  const phoneNumberId = String(shop.waba_phone_number_id ?? "").trim();
  const encrypted = String(shop.waba_access_token_encrypted ?? "").trim();
  if (!phoneNumberId || !encrypted) return null;

  const accessToken = await decryptWabaToken(encrypted);
  if (!accessToken) return null;

  return {
    barbershopId: shop.id,
    phoneNumberId,
    accessToken,
  };
}

async function resolveMetaShopSendContext(
  supabase: SupabaseClient,
  barbeariaId: string,
  templateKind: WhatsAppOperationalTemplateKind,
): Promise<MetaShopSendContext | null> {
  const sendShopId = await resolveMetaSendShopIdForBarbearia(
    supabase,
    barbeariaId,
    templateKind,
  );
  if (!sendShopId) return null;

  const selectedShop = await loadBarbershopRowByBarbeariaId(supabase, barbeariaId);
  if (!selectedShop) return null;

  let sendShop: BarbershopMessagingRow = selectedShop;
  if (sendShopId !== selectedShop.id) {
    const { data: borrowed, error } = await supabase
      .from("barbershops")
      .select(
        "id, slug, owner_id, whatsapp_messaging_provider, waba_connect_status, waba_phone_number_id, waba_access_token_encrypted",
      )
      .eq("id", sendShopId)
      .maybeSingle();

    if (error || !borrowed?.id) return null;
    sendShop = borrowed as BarbershopMessagingRow;
  }

  return loadMetaShopSendCredentials(supabase, sendShop);
}

/** Sem template selecionado/aprovado ou loja não Meta → null (skip silencioso). */
export async function sendMetaWhatsAppOperationalTemplate(
  supabase: SupabaseClient,
  params: {
    barbeariaId: string;
    toE164Digits: string;
    templateKind: WhatsAppOperationalTemplateKind;
    appointment: { cliente_nome: string; data: string; hora: string };
  },
): Promise<MetaSendTemplateResult | null> {
  const ctx = await resolveMetaShopSendContext(
    supabase,
    params.barbeariaId,
    params.templateKind,
  );
  if (!ctx) return null;

  const template = await resolveSelectedWabaTemplateForKind(
    supabase,
    ctx.barbershopId,
    params.templateKind,
  );
  if (!template) return null;

  const sentinelaCategory = sentinelaCategoryForWhatsAppTemplateKind(params.templateKind);
  if (!sentinelaCategory) return null;

  const bodyParameters = buildMetaTemplateBodyParameters(
    template.body_display_text,
    template.language,
    params.appointment,
  );

  try {
    console.info(
      `[metaWhatsappMessaging] envio barbearia_agendamento=${params.barbeariaId} send_shop_id=${ctx.barbershopId} phone_number_id=${ctx.phoneNumberId} kind=${params.templateKind}`,
    );
    const result = await sendMetaWhatsAppTemplateMessage({
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
      toE164Digits: params.toE164Digits,
      templateName: template.meta_template_name,
      languageCode: template.language,
      bodyParameters,
    });

    return {
      externalMessageId: result.messageId,
      messageStatus: result.messageStatus,
      provider: "meta",
      status: "accepted",
      wabaTemplateId: template.id,
      barbershopId: ctx.barbershopId,
      sentinelaCategory,
    };
  } catch (e) {
    if (e instanceof MetaWhatsappSendError && e.qualityLimited) {
      console.error(
        `[metaWhatsappMessaging] qualidade/spam (131048) barbearia=${params.barbeariaId} template=${template.meta_template_name}`,
      );
    }
    throw e;
  }
}

/** Barbearias que entram no pipeline Meta (conectadas ou sendable via par CT/CA). */
export async function loadMetaDirectBarbeariaIdSet(
  supabase: SupabaseClient,
  barbeariaIds: string[],
  templateKind: WhatsAppOperationalTemplateKind,
): Promise<Set<string>> {
  const unique = [...new Set(barbeariaIds.filter(Boolean))];
  if (unique.length === 0) return new Set();

  const metaBarbeariaIds = new Set<string>();
  await Promise.all(
    unique.map(async (barbeariaId) => {
      const enters = await barbeariaEntersMetaPipelineForKind(
        supabase,
        barbeariaId,
        templateKind,
      );
      if (enters) metaBarbeariaIds.add(barbeariaId);
    }),
  );

  return metaBarbeariaIds;
}

export { barbeariaEntersMetaPipelineForKind } from "./metaWabaAggregationSend.ts";

export { resolveBarbershopIdForBarbearia };
