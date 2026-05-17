import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const idQs = url.searchParams.get("id") || url.searchParams.get("data.id");

    let payload: any = {};
    try { payload = await req.json(); } catch { /* ignore */ }

    console.log("MP webhook:", { topic, idQs, payload });

    const resourceId = payload?.data?.id || idQs;
    const resourceType = payload?.type || topic;

    if (!resourceId) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Tratar preapproval (assinatura)
    if (resourceType === "preapproval" || resourceType === "subscription_preapproval") {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
        headers: { "Authorization": `Bearer ${mpToken}` },
      });
      const sub = await mpRes.json();
      console.log("preapproval:", sub);

      const status = sub.status; // authorized | paused | cancelled | pending
      const ativa = status === "authorized";
      const planoStatus = status === "authorized" ? "ativo"
        : status === "cancelled" ? "cancelado"
        : status === "paused" ? "pausado"
        : "pendente";

      const barbeariaId = sub.external_reference;
      if (barbeariaId) {
        await supabase.from("barbearias").update({
          ativa,
          plano_status: planoStatus,
          mp_subscription_id: sub.id,
        }).eq("id", barbeariaId);
      } else {
        await supabase.from("barbearias").update({
          ativa,
          plano_status: planoStatus,
        }).eq("mp_subscription_id", sub.id);
      }
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("webhook error:", e);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
});
