import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  accountCanReceiveDestinationCharges,
  assertStripeTestMode,
  getStripe,
  resolveConnectShopForUser,
  seedTestConnectAccountDetailed,
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
    assertStripeTestMode();

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
          error: "Pagamentos centralizados pelo titular. Peça ao titular para criar a conta de teste.",
        }, 403);
      }
      return jsonResponse({ error: "Empresa não encontrada" }, 404);
    }

    const shop = resolved.shop;
    const stripe = getStripe();

    const { account, requirements_due, disabled_reason } = await seedTestConnectAccountDetailed(stripe, {
      email: user.email.trim(),
      shopId: shop.id,
      ownerId: user.id,
      displayName: shop.display_name,
    });

    const status = await syncConnectAccountToShop(supabase, shop.id, account);

    return jsonResponse({
      ok: true,
      account_id: account.id,
      status,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      transfers_enabled: accountCanReceiveDestinationCharges(account),
      requirements_due,
      disabled_reason,
      message: account.charges_enabled
        ? "Conta de teste pronta para cobrança no link público."
        : status === "restricted"
          ? "Conta criada, mas a Stripe ainda marca como restrita. Clique no botão de teste novamente após o deploy ou veja os requisitos pendentes."
          : "Conta criada; aguarde alguns segundos e recarregue Pagamentos.",
    });
  } catch (e) {
    console.error("stripe-connect-seed-test-account:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
