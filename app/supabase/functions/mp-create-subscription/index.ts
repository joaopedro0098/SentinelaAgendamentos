import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPlanMonthlyAmount } from "../_shared/planPricing.ts";
import {
  cancelPreapproval,
  ensurePreapprovalPlan,
  findLatestPreapproval,
  getPreapproval,
  readJsonOrText,
  resolvePreapprovalCheckoutUrl,
} from "../_shared/mpPreapproval.ts";

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

function getMpErrorMessage(details: unknown) {
  if (!details || typeof details !== "object") return "erro não informado pelo Mercado Pago.";

  const record = details as {
    message?: string;
    error?: string;
    cause?: Array<{ description?: string; code?: string }>;
  };

  const cause = record.cause?.find((item) => item.description)?.description;
  return cause ?? record.message ?? record.error ?? "erro não informado pelo Mercado Pago.";
}

function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autenticado" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Token inválido" }, 401);
    }
    const user = userData.user;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin) {
      return jsonResponse({ error: "Conta administrativa não requer assinatura." }, 400);
    }

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
    if (!mpToken) {
      return jsonResponse({ error: "Mercado Pago não configurado (MP_ACCESS_TOKEN)." }, 503);
    }

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, display_name")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!shop) {
      return jsonResponse({ error: "Empresa não encontrada" }, 404);
    }

    if (!user.email?.trim()) {
      return jsonResponse({ error: "Sua conta precisa de um e-mail válido para assinar com cartão." }, 400);
    }

    const origin = cleanUrl(Deno.env.get("APP_URL")) ||
      cleanUrl(req.headers.get("origin")) ||
      "https://sentinelagendamentos.com";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const planAmount = getPlanMonthlyAmount();
    const backUrl = `${origin}/app/perfil?subscription=return`;

    let planId: string;
    try {
      planId = await ensurePreapprovalPlan(mpToken, planAmount, backUrl);
    } catch (planError) {
      return jsonResponse(
        {
          error: planError instanceof Error ? planError.message : "Falha ao preparar plano de assinatura.",
        },
        502,
      );
    }

    const latest = await findLatestPreapproval(mpToken, shop.id);
    if (latest?.id && latest.status === "pending" && sameEmail(latest.payer_email, user.email)) {
      const fresh = (await getPreapproval(mpToken, latest.id)) ?? latest;
      const checkoutUrl = resolvePreapprovalCheckoutUrl(fresh, mpToken);
      if (checkoutUrl) {
        return jsonResponse({ init_point: checkoutUrl, id: fresh.id, reused: true });
      }
    }

    if (latest?.id && latest.status === "pending") {
      await cancelPreapproval(mpToken, latest.id);
    }

    const body: Record<string, unknown> = {
      preapproval_plan_id: planId,
      payer_email: user.email.trim(),
      back_url: backUrl,
      notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
      external_reference: shop.id,
      status: "pending",
    };

    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const mpData = await readJsonOrText(mpRes);
    if (!mpRes.ok) {
      console.error("MP error:", mpData);
      return jsonResponse(
        {
          error: `Mercado Pago recusou a criação da assinatura: ${getMpErrorMessage(mpData)}`,
          details: mpData,
        },
        502,
      );
    }

    await supabase
      .from("barbershops")
      .update({
        subscription_notice:
          "No Mercado Pago: use o mesmo e-mail da Sentinela. Na tela \"Confirme sua assinatura\", toque no cartão para selecioná-lo e libere o botão Confirmar.",
      })
      .eq("id", shop.id);

    const data = mpData as { init_point?: string; sandbox_init_point?: string; id?: string };
    const checkoutUrl = resolvePreapprovalCheckoutUrl(data, mpToken);
    if (!checkoutUrl) {
      return jsonResponse({ error: "Mercado Pago não retornou o link de pagamento.", details: mpData }, 502);
    }

    return jsonResponse({ init_point: checkoutUrl, id: data.id });
  } catch (e) {
    console.error("mp-create-subscription:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
