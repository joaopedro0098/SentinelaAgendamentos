import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createAccountLinkV1,
  createConnectAccountV1,
  getStripe,
  paymentsReturnUrls,
  requestConnectRecipientTransfersV2,
  resolveAppOriginForConnect,
  resolveConnectShopForUser,
  tryCreateAccountLinkV2,
  tryCreateConnectAccountV2,
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
    const user = userData.user;
    if (!user.email?.trim()) {
      return jsonResponse({ error: "Sua conta precisa de um e-mail válido." }, 400);
    }

    const resolved = await resolveConnectShopForUser(supabase, user.id);
    if ("error" in resolved) {
      if (resolved.error === "centralized_readonly") {
        return jsonResponse({
          error: "Pagamentos centralizados pelo titular. Peça ao titular para conectar a conta Stripe.",
        }, 403);
      }
      return jsonResponse({ error: "Empresa não encontrada" }, 404);
    }

    const shop = resolved.shop;

    let body: Record<string, unknown> = {};
    try {
      const raw = await req.text();
      if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const clientOrigin = typeof body.return_origin === "string" ? body.return_origin : null;
    const origin = resolveAppOriginForConnect(
      Deno.env.get("APP_URL"),
      req.headers.get("origin"),
      clientOrigin,
    );
    const { return_url, refresh_url } = paymentsReturnUrls(origin);

    let accountId = shop.stripe_connect_account_id;
    const stripe = getStripe();

    if (accountId) {
      try {
        await requestConnectRecipientTransfersV2(accountId);
      } catch (e) {
        console.warn("stripe-connect-onboard: recipient transfers request failed", e);
      }
    }

    if (!accountId) {
      let v2Error: string | null = null;
      try {
        accountId = await tryCreateConnectAccountV2(user.email.trim(), shop.id, user.id);
      } catch (e) {
        v2Error = e instanceof Error ? e.message : String(e);
        console.warn("stripe-connect-onboard: v2 account failed, fallback v1", v2Error);
        accountId = await createConnectAccountV1(stripe, user.email.trim(), shop.id, user.id);
      }

      await supabase
        .from("barbershops")
        .update({
          stripe_connect_account_id: accountId,
          stripe_connect_status: "pending",
          stripe_connect_email: user.email.trim(),
        })
        .eq("id", shop.id);
    }

    let onboardingUrl: string;
    try {
      onboardingUrl = await tryCreateAccountLinkV2(accountId, return_url, refresh_url);
    } catch (e) {
      console.warn("stripe-connect-onboard: v2 account_link failed, fallback v1", e);
      onboardingUrl = await createAccountLinkV1(stripe, accountId, return_url, refresh_url);
    }

    return jsonResponse({ url: onboardingUrl, account_id: accountId });
  } catch (e) {
    console.error("stripe-connect-onboard:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
