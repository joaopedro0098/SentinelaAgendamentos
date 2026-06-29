import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  accountCanReceiveDestinationCharges,
  capabilityStatusLabel,
  connectAccountPixPaymentsActive,
  getStripe,
  refreshConnectAccountWithPix,
  requestConnectRecipientTransfersV2,
  resolveConnectShopForUser,
  retrievePlatformAccount,
  syncConnectAccountToShop,
} from "../_shared/stripeConnect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return jsonResponse({ error: "Token inválido" }, 401);

    const resolved = await resolveConnectShopForUser(supabase, userData.user.id);
    if ("error" in resolved) {
      if (resolved.error === "centralized_readonly") {
        return jsonResponse({ ok: true, readonly: true });
      }
      return jsonResponse({ error: "Empresa não encontrada" }, 404);
    }

    const shop = resolved.shop;
    if (!shop.stripe_connect_account_id) {
      return jsonResponse({ status: "not_connected" });
    }

    const stripe = getStripe();
    try {
      await requestConnectRecipientTransfersV2(shop.stripe_connect_account_id);
    } catch (e) {
      console.warn("stripe-connect-sync: recipient transfers request failed", e);
    }

    const account = await refreshConnectAccountWithPix(stripe, shop.stripe_connect_account_id);
    const status = await syncConnectAccountToShop(supabase, shop.id, account);
    const platform = await retrievePlatformAccount(stripe);

    return jsonResponse({
      ok: true,
      status,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      transfers_enabled: accountCanReceiveDestinationCharges(account),
      pix_payments_connect: account.capabilities?.pix_payments ?? null,
      pix_payments_platform: platform?.capabilities?.pix_payments ?? null,
      pix_enabled_on_checkout: connectAccountPixPaymentsActive(account),
      pix_connect_label: capabilityStatusLabel(account.capabilities?.pix_payments),
      pix_platform_label: capabilityStatusLabel(platform?.capabilities?.pix_payments),
    });
  } catch (e) {
    console.error("stripe-connect-sync:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
