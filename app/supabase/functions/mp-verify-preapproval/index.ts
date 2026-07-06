import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  fetchMpPreapproval,
  mapPreapprovalToUiStatus,
  parseShopIdFromPreapprovalExternalReference,
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

    const body = (await req.json().catch(() => ({}))) as { preapproval_id?: string };
    const preapprovalId = body.preapproval_id?.trim();
    if (!preapprovalId) {
      return jsonResponse({ ok: false, ui_status: "invalid", error: "preapproval_id ausente" }, 400);
    }

    const { data: shop } = await supabase
      .from("barbershops")
      .select("id, owner_id, mp_subscription_id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ ok: false, ui_status: "invalid", error: "Empresa não encontrada" }, 404);

    if (shop.mp_subscription_id !== preapprovalId) {
      return jsonResponse({ ok: false, ui_status: "invalid", error: "Assinatura não pertence a esta conta" }, 403);
    }

    const preapproval = await fetchMpPreapproval(preapprovalId);
    const shopFromRef = parseShopIdFromPreapprovalExternalReference(preapproval.external_reference);
    if (shopFromRef && shopFromRef !== shop.id) {
      return jsonResponse({ ok: false, ui_status: "invalid", error: "Referência inválida" }, 403);
    }

    const uiStatus = mapPreapprovalToUiStatus(preapproval.status);
    const { data: subscription } = await userClient.rpc("get_my_subscription");

    return jsonResponse({
      ok: true,
      ui_status: uiStatus,
      mp_status: preapproval.status ?? null,
      subscription_status:
        subscription && typeof subscription === "object" && "subscription_status" in subscription
          ? (subscription as { subscription_status?: string }).subscription_status
          : null,
    });
  } catch (e) {
    console.error("mp-verify-preapproval:", e);
    return jsonResponse(
      { ok: false, ui_status: "invalid", error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});
