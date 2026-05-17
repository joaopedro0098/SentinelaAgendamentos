import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const body = await req.json();
    const planoTipo = body.plano_tipo as string;
    if (!["basico", "intermediario", "avancado"].includes(planoTipo)) {
      return new Response(JSON.stringify({ error: "Plano inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: plano } = await supabase
      .from("planos").select("*").eq("tipo", planoTipo).maybeSingle();
    if (!plano) {
      return new Response(JSON.stringify({ error: "Plano não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: barbearia } = await supabase
      .from("barbearias").select("*").eq("owner_id", user.id).maybeSingle();
    if (!barbearia) {
      return new Response(JSON.stringify({ error: "Barbearia não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN")!;
    const origin = req.headers.get("origin") || "https://app.exemplo.com";

    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${mpToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preapproval_plan_id: plano.mp_plan_id,
        payer_email: user.email,
        back_url: `${origin}/dashboard?subscription=success`,
        external_reference: barbearia.id,
        reason: `Assinatura ${plano.nome_exibicao}`,
        status: "pending",
      }),
    });

    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      console.error("MP error:", mpData);
      return new Response(JSON.stringify({ error: "Erro ao criar assinatura no Mercado Pago", details: mpData }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("barbearias").update({
      mp_subscription_id: mpData.id,
      plano: planoTipo,
      plano_status: "pendente",
    }).eq("id", barbearia.id);

    return new Response(JSON.stringify({ init_point: mpData.init_point, id: mpData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Exception:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
