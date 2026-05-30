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

async function createCheckoutPreference(params: {
  mpToken: string;
  supabaseUrl: string;
  origin: string;
  userEmail?: string;
  shopId: string;
  shopName: string;
  planAmount: number;
}) {
  const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.mpToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: [
        {
          id: "sentinela-mensalidade-pix",
          title: "Mensalidade Sentinela Agendamentos",
          description: `Pagamento mensal avulso — ${params.shopName}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: params.planAmount,
        },
      ],
      payer: { email: params.userEmail },
      external_reference: `barbershop_pix:${params.shopId}`,
      notification_url: `${params.supabaseUrl}/functions/v1/mp-webhook`,
      back_urls: {
        success: `${params.origin}/app/perfil?payment=success`,
        pending: `${params.origin}/app/perfil?payment=pending`,
        failure: `${params.origin}/app/perfil?payment=failure`,
      },
      auto_return: "approved",
      expires: true,
      expiration_date_to: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      payment_methods: {
        excluded_payment_types: [
          { id: "credit_card" },
          { id: "debit_card" },
          { id: "ticket" },
          { id: "atm" },
        ],
        installments: 1,
      },
    }),
  });

  const mpData = await readJsonOrText(mpRes);
  if (!mpRes.ok) {
    console.error("MP preference fallback error:", mpData);
    return {
      ok: false as const,
      data: mpData,
      error: `Mercado Pago recusou o Checkout Pro: ${getMpErrorMessage(mpData)}`,
    };
  }

  const data = mpData as { init_point?: string; sandbox_init_point?: string; id?: string };
  const checkoutUrl = data.init_point ?? data.sandbox_init_point;
  if (!checkoutUrl) {
    return {
      ok: false as const,
      data: mpData,
      error: "Mercado Pago não retornou o link de pagamento.",
    };
  }

  return { ok: true as const, init_point: checkoutUrl, id: data.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Não autenticado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Token inválido" }, 401);
    }
    const user = userData.user;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin) {
      return jsonResponse({ error: "Conta administrativa não requer pagamento." }, 400);
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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);
    const origin = cleanUrl(Deno.env.get("APP_URL")) ||
      cleanUrl(req.headers.get("origin")) ||
      "https://sentinelagendamentos.com";
    const planAmount = getPlanMonthlyAmount();

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: planAmount,
        description: `Mensalidade Sentinela Agendamentos — ${shop.display_name}`,
        payment_method_id: "pix",
        payer: { email: user.email },
        external_reference: `barbershop_pix:${shop.id}`,
        notification_url: `${supabaseUrl}/functions/v1/mp-webhook`,
        date_of_expiration: expiresAt.toISOString(),
      }),
    });

    const mpData = await readJsonOrText(mpRes);
    if (!mpRes.ok) {
      console.error("MP pix payment error:", mpData);
      const fallback = await createCheckoutPreference({
        mpToken,
        supabaseUrl,
        origin,
        userEmail: user.email,
        shopId: shop.id,
        shopName: shop.display_name,
        planAmount,
      });

      if (fallback.ok) {
        await supabase
          .from("barbershops")
          .update({
            subscription_notice: "Finalize o pagamento no Mercado Pago para liberar mais 30 dias.",
          })
          .eq("id", shop.id);

        return jsonResponse({
          init_point: fallback.init_point,
          id: fallback.id,
          fallback: "checkout_pro",
          warning: `Pix direto indisponível: ${getMpErrorMessage(mpData)}`,
        });
      }

      return jsonResponse(
        {
          error: fallback.error,
          details: { pix: mpData, checkout: fallback.data },
        },
        502,
      );
    }

    const data = mpData as {
      id?: string;
      point_of_interaction?: {
        transaction_data?: {
          ticket_url?: string;
          qr_code?: string;
          qr_code_base64?: string;
        };
      };
    };
    const transactionData = data.point_of_interaction?.transaction_data;
    if (!transactionData?.ticket_url) {
      return jsonResponse({ error: "Mercado Pago não retornou o link Pix.", details: mpData }, 502);
    }

    await supabase
      .from("barbershops")
      .update({
        subscription_notice: "Finalize o pagamento Pix no Mercado Pago para liberar mais 30 dias.",
      })
      .eq("id", shop.id);

    return jsonResponse({
      init_point: transactionData.ticket_url,
      id: data.id,
      qr_code: transactionData.qr_code,
      qr_code_base64: transactionData.qr_code_base64,
    });
  } catch (e) {
    console.error("mp-create-pix-payment:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
