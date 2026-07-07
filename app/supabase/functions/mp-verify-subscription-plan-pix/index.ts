import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  activateShopSubscription,
  buildPlanPixExternalReference,
  getPlatformMpAccessToken,
  normalizeSubscriptionTier,
} from "../_shared/mpPlatformBilling.ts";

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
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

    const body = (await req.json().catch(() => ({}))) as { tier?: string; payment_id?: string | number };
    const tier = normalizeSubscriptionTier(body.tier);
    if (!tier) return jsonResponse({ error: "Plano inválido." }, 400);

    const paymentId =
      body.payment_id != null && String(body.payment_id).trim() !== ""
        ? String(body.payment_id).trim()
        : "";

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, current_period_end, subscription_status")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ error: "Empresa não encontrada" }, 404);

    const mpToken = getPlatformMpAccessToken();
    const externalRef = buildPlanPixExternalReference(shop.id, tier);

    let paymentStatus: string | null = null;

    if (paymentId) {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      const payment = await mpRes.json().catch(() => ({}));
      if (mpRes.ok) {
        paymentStatus = String((payment as { status?: string }).status ?? "");
        const ref = String((payment as { external_reference?: string }).external_reference ?? "");
        if (ref !== externalRef) {
          return jsonResponse({ error: "Pagamento não pertence a este plano." }, 403);
        }
      }
    }

    if (paymentStatus !== "approved") {
      const searchRes = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}&sort=date_created&criteria=desc&limit=5`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      );
      const searchData = await searchRes.json().catch(() => ({}));
      const payments = ((searchData as { results?: Array<{ status?: string }> }).results ?? []);
      const approved = payments.find((p) => p.status === "approved");
      paymentStatus = approved ? "approved" : payments[0]?.status ?? "pending";
    }

    if (paymentStatus === "approved") {
      await activateShopSubscription(supabase, shop.id, {
        tier,
        lastPaymentMethod: "pix",
        currentPeriodEnd: shop.current_period_end,
      });
    }

    const { data: subscription } = await userClient.rpc("get_my_subscription");

    return jsonResponse({
      ok: true,
      payment_status: paymentStatus,
      activated: paymentStatus === "approved",
      subscription,
    });
  } catch (e) {
    console.error("mp-verify-subscription-plan-pix:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
