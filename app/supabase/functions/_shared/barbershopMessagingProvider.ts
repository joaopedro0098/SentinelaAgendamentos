import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptWabaToken } from "./wabaCrypto.ts";
import type { InfobipSendCredentials } from "./infobipWhatsapp.ts";

export type WhatsAppMessagingProvider = "twilio" | "infobip";

export async function resolveBarbershopMessagingProvider(
  supabase: SupabaseClient,
  barbeariaId: string,
): Promise<WhatsAppMessagingProvider> {
  const { data: barbearia, error: barbeariaError } = await supabase
    .from("barbearias")
    .select("slug")
    .eq("id", barbeariaId)
    .maybeSingle();

  if (barbeariaError || !barbearia?.slug) {
    console.warn(
      `resolveBarbershopMessagingProvider: barbearia ${barbeariaId} sem slug (${barbeariaError?.message ?? "not found"}), default twilio.`,
    );
    return "twilio";
  }

  const { data: shop, error: shopError } = await supabase
    .from("barbershops")
    .select("whatsapp_messaging_provider")
    .eq("slug", barbearia.slug)
    .maybeSingle();

  if (shopError || !shop) {
    console.warn(
      `resolveBarbershopMessagingProvider: barbershops slug "${barbearia.slug}" não encontrado, default twilio.`,
    );
    return "twilio";
  }

  const provider = shop.whatsapp_messaging_provider;
  if (provider === "infobip" || provider === "twilio") {
    return provider;
  }

  return "twilio";
}

export async function resolveBarbershopInfobipCredentials(
  supabase: SupabaseClient,
  barbeariaId: string,
): Promise<InfobipSendCredentials | undefined> {
  const globalApiKey = Deno.env.get("INFOBIP_API_KEY")?.trim();
  const globalBaseUrl = Deno.env.get("INFOBIP_BASE_URL")?.trim();
  const globalSender = Deno.env.get("INFOBIP_WHATSAPP_SENDER")?.trim();

  const { data: barbearia } = await supabase
    .from("barbearias")
    .select("slug")
    .eq("id", barbeariaId)
    .maybeSingle();

  if (!barbearia?.slug) {
    if (globalApiKey && globalBaseUrl && globalSender) {
      return { apiKey: globalApiKey, baseUrl: globalBaseUrl, sender: globalSender };
    }
    return undefined;
  }

  const { data: shop } = await supabase
    .from("barbershops")
    .select("infobip_sender_number, infobip_api_key_encrypted")
    .eq("slug", barbearia.slug)
    .maybeSingle();

  const sender = String(shop?.infobip_sender_number ?? globalSender ?? "").trim();
  const encryptedKey = String(shop?.infobip_api_key_encrypted ?? "").trim();

  let apiKey = globalApiKey ?? "";
  if (encryptedKey) {
    const decrypted = await decryptWabaToken(encryptedKey);
    if (decrypted) apiKey = decrypted;
  }

  if (!apiKey || !globalBaseUrl || !sender) {
    return undefined;
  }

  return { apiKey, baseUrl: globalBaseUrl, sender };
}

/** Gate de produção: templates só disparam quando explicitamente habilitado. */
export function isWhatsAppTemplateSendEnabled(): boolean {
  return Deno.env.get("WHATSAPP_TEMPLATE_SEND_ENABLED") === "true";
}
