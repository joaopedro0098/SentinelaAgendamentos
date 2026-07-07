import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildPreapprovalExternalReference,
  buildPreapprovalFreeTrial,
  getPlatformMpAccessToken,
  getPreapprovalPlanId,
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

function cleanUrl(value: string | null | undefined) {
  return value?.trim().replace(/\/+$/, "");
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
    if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
    const user = userData.user;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin) return jsonResponse({ error: "Conta administrativa não requer assinatura." }, 400);

    if (!user.email?.trim()) {
      return jsonResponse({ error: "Sua conta precisa de um e-mail válido para assinar." }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as { tier?: string };
    const planId = getPreapprovalPlanId(body.tier);
    const tier = normalizeSubscriptionTier(body.tier);
    if (!tier) {
      return jsonResponse({ error: "Plano inválido. Escolha Start ou Pro." }, 400);
    }
    const mpToken = getPlatformMpAccessToken();

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, display_name, subscription_status, mp_subscription_id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ error: "Empresa não encontrada" }, 404);

    if (shop.subscription_status === "active" && shop.mp_subscription_id) {
      return jsonResponse({ error: "Você já possui uma assinatura ativa com Mercado Pago." }, 400);
    }

    const origin = cleanUrl(Deno.env.get("APP_URL")) ||
      cleanUrl(req.headers.get("origin")) ||
      "https://sentinelagendamentos.com";
    const backUrl = `${origin}/app/perfil/assinatura/retorno`;

    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preapproval_plan_id: planId,
        reason: `Assinatura Sentinela Agendamentos — ${shop.display_name}`,
        external_reference: buildPreapprovalExternalReference(shop.id, tier),
        payer_email: user.email.trim(),
        back_url: backUrl,
        auto_recurring: {
          free_trial: buildPreapprovalFreeTrial(),
        },
      }),
    });

    const mpData = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      console.error("mp-create-preapproval:", mpData);
      const message =
        typeof mpData === "object" && mpData !== null && "message" in mpData
          ? String((mpData as { message?: string }).message)
          : "Mercado Pago recusou a criação da assinatura.";
      return jsonResponse({ error: message }, 502);
    }

    const preapprovalId = String((mpData as { id?: string }).id ?? "").trim();
    const initPoint = String(
      (mpData as { sandbox_init_point?: string }).sandbox_init_point ??
        (mpData as { init_point?: string }).init_point ??
        "",
    ).trim();

    if (!preapprovalId || !initPoint) {
      return jsonResponse({ error: "Mercado Pago não retornou dados para concluir a assinatura." }, 502);
    }

    await supabase
      .from("barbershops")
      .update({
        mp_subscription_id: preapprovalId,
        subscription_tier: tier,
        subscription_notice: "Finalize a assinatura no Mercado Pago para ativar o plano.",
      })
      .eq("id", shop.id);

    return jsonResponse({
      preapproval_id: preapprovalId,
      init_point: initPoint,
      back_url: backUrl,
    });
  } catch (e) {
    console.error("mp-create-preapproval:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
