import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, mp_subscription_id, current_period_end")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (!shop?.mp_subscription_id) {
      return jsonResponse({ error: "Nenhuma assinatura ativa encontrada." }, 404);
    }

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
    if (!mpToken) {
      return jsonResponse({ error: "Mercado Pago não configurado." }, 503);
    }

    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${shop.mp_subscription_id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (!mpRes.ok) {
      const details = await readJsonOrText(mpRes);
      console.error("MP cancel error:", details);
      return jsonResponse(
        {
          error: `Não foi possível cancelar no Mercado Pago: ${getMpErrorMessage(details)}`,
          details,
        },
        502,
      );
    }

    const notice = "Assinatura cancelada. O acesso continua até o fim do período já pago.";
    await supabase
      .from("barbershops")
      .update({
        subscription_status: "cancelled",
        subscription_notice: notice,
      })
      .eq("id", shop.id);

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
