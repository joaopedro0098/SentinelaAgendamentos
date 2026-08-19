import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptWabaToken } from "./wabaCrypto.ts";
import type { TwilioSendCredentials } from "./twilioWhatsapp.ts";

export async function resolveBarbershopTwilioCredentials(
  supabase: SupabaseClient,
  barbeariaId: string,
): Promise<TwilioSendCredentials | undefined> {
  const { data: barbearia, error: barbeariaError } = await supabase
    .from("barbearias")
    .select("slug")
    .eq("id", barbeariaId)
    .maybeSingle();

  if (barbeariaError || !barbearia?.slug) {
    if (barbeariaError) {
      console.warn(
        `resolveBarbershopTwilioCredentials: erro ao buscar barbearia ${barbeariaId} (${barbeariaError.message}), usando fallback global.`,
      );
    } else {
      console.warn(
        `resolveBarbershopTwilioCredentials: barbearia ${barbeariaId} sem slug, usando fallback global.`,
      );
    }
    return undefined;
  }

  const barbeariaSlug = barbearia.slug;

  const { data: shop, error: shopError } = await supabase
    .from("barbershops")
    .select("twilio_subaccount_sid, twilio_subaccount_auth_token, sender_phone_e164")
    .eq("slug", barbeariaSlug)
    .maybeSingle();

  if (shopError || !shop) {
    if (shopError) {
      console.warn(
        `resolveBarbershopTwilioCredentials: erro ao buscar barbershops com slug "${barbeariaSlug}" (barbearia ${barbeariaId}: ${shopError.message}), usando fallback global.`,
      );
    } else {
      console.warn(
        `resolveBarbershopTwilioCredentials: nenhum barbershops encontrado com slug "${barbeariaSlug}" (barbearia ${barbeariaId}), usando fallback global.`,
      );
    }
    return undefined;
  }

  const accountSid = String(shop.twilio_subaccount_sid ?? "").trim();
  const encryptedToken = String(shop.twilio_subaccount_auth_token ?? "").trim();
  const from = String(shop.sender_phone_e164 ?? "").trim();

  if (!accountSid || !encryptedToken || !from) {
    const missing: string[] = [];
    if (!accountSid) missing.push("twilio_subaccount_sid");
    if (!encryptedToken) missing.push("twilio_subaccount_auth_token");
    if (!from) missing.push("sender_phone_e164");
    console.warn(
      `resolveBarbershopTwilioCredentials: barbershops slug "${barbeariaSlug}" (barbearia ${barbeariaId}) com campos ausentes (${missing.join(", ")}), usando fallback global.`,
    );
    return undefined;
  }

  const authToken = await decryptWabaToken(encryptedToken);
  if (!authToken) {
    console.warn(
      `resolveBarbershopTwilioCredentials: twilio_subaccount_auth_token vazio após decifragem para barbershops slug "${barbeariaSlug}" (barbearia ${barbeariaId}), usando fallback global.`,
    );
    return undefined;
  }

  return { accountSid, authToken, from };
}
