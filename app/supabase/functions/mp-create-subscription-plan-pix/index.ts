import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildPlanPixExternalReference,
  getPlatformMpAccessToken,
  getTierMonthlyAmount,
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
    if (!authHeader) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
    const user = userData.user;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin) return jsonResponse({ error: "Conta administrativa não requer pagamento." }, 400);

    const body = (await req.json().catch(() => ({}))) as { tier?: string };
    const tier = normalizeSubscriptionTier(body.tier);
    if (!tier) return jsonResponse({ error: "Plano inválido. Escolha Start ou Pro." }, 400);

    const mpToken = getPlatformMpAccessToken();

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, display_name, subscription_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ error: "Empresa não encontrada" }, 404);

    const planAmount = getTierMonthlyAmount(tier);
    const tierLabel = tier === "pro" ? "Pro" : "Start";
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: planAmount,
        description: `Plano ${tierLabel} Sentinela Agendamentos — ${shop.display_name}`,
        payment_method_id: "pix",
        payer: { email: user.email },
        external_reference: buildPlanPixExternalReference(shop.id, tier),
        notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
        date_of_expiration: expiresAt.toISOString(),
      }),
    });

    const mpData = await readJsonOrText(mpRes);
    if (!mpRes.ok) {
      console.error("mp-create-subscription-plan-pix:", mpData);
      return jsonResponse(
        { error: `Mercado Pago recusou o Pix: ${getMpErrorMessage(mpData)}` },
        502,
      );
    }

    const data = mpData as {
      id?: string;
      point_of_interaction?: {
        transaction_data?: {
          qr_code?: string;
          qr_code_base64?: string;
        };
      };
    };

    const transactionData = data.point_of_interaction?.transaction_data;
    if (!transactionData?.qr_code) {
      return jsonResponse({ error: "Mercado Pago não retornou o QR Code Pix.", details: mpData }, 502);
    }

    await supabase
      .from("barbershops")
      .update({
        subscription_tier: tier,
        subscription_notice: `Pague o Pix do plano ${tierLabel} para ativar sua assinatura.`,
      })
      .eq("id", shop.id);

    return jsonResponse({
      ok: true,
      payment_id: data.id,
      qr_code: transactionData.qr_code,
      qr_code_base64: transactionData.qr_code_base64 ?? null,
      tier,
      amount: planAmount,
    });
  } catch (e) {
    console.error("mp-create-subscription-plan-pix:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
