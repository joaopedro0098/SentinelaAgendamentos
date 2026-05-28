import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPlanMonthlyAmount } from "../_shared/planPricing.ts";

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

async function readJsonOrText(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
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

    const origin = cleanUrl(Deno.env.get("APP_URL")) ||
      cleanUrl(req.headers.get("origin")) ||
      "https://sentinelagendamentos.com";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const planAmount = getPlanMonthlyAmount();

    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payer_email: user.email,
        back_url: `${origin}/app/perfil?subscription=success`,
        notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
        external_reference: shop.id,
        reason: `Assinatura Sentinela — ${shop.display_name}`,
        status: "pending",
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: planAmount,
          currency_id: "BRL",
        },
      }),
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
        subscription_notice: "Complete o pagamento no Mercado Pago para ativar sua assinatura.",
      })
      .eq("id", shop.id);

    const data = mpData as { init_point?: string; id?: string };
    if (!data.init_point) {
      return jsonResponse({ error: "Mercado Pago não retornou o link de pagamento.", details: mpData }, 502);
    }

    return jsonResponse({ init_point: data.init_point, id: data.id });
  } catch (e) {
    console.error("mp-create-subscription:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
