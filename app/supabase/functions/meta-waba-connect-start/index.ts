/**
 * POST /meta-waba-connect-start
 *
 * Embedded Signup Meta Direct (Tech Provider): troca code, subscribed_apps, register, persist token.
 * Caminho principal quando postMessage FINISH chega ao frontend.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  completeMetaWabaConnect,
  exchangeCodeForAccessToken,
  parseFlowType,
} from "../_shared/metaWabaConnect.ts";

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
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Sessão inválida." }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }

    const code = String(body.code ?? "").trim();
    const wabaId = String(body.waba_id ?? "").trim();
    const phoneNumberId = String(body.phone_number_id ?? "").trim();
    const flowTypeRaw = String(body.flow_type ?? "").trim();
    const businessId = String(body.business_id ?? "").trim() || null;

    const flowType = parseFlowType(flowTypeRaw);
    if (!code || !wabaId || !flowType) {
      return jsonResponse({
        error: "Campos code, waba_id e flow_type válido são obrigatórios.",
      }, 400);
    }
    if (flowType !== "existing_phone_number" && !phoneNumberId) {
      return jsonResponse({
        error: "phone_number_id é obrigatório para este fluxo.",
      }, 400);
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: shop, error: shopErr } = await serviceClient
      .from("barbershops")
      .select("id, waba_connect_status, waba_id")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (shopErr) return jsonResponse({ error: shopErr.message }, 500);
    if (!shop) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    if (shop.waba_connect_status === "connected") {
      return jsonResponse({
        success: true,
        status: "connected",
        message: "WhatsApp já está conectado.",
      });
    }

    const codeCapturedAtMs = Number(body.code_captured_at_ms);

    let accessToken: string;
    try {
      accessToken = await exchangeCodeForAccessToken(code);
    } catch (exchangeErr) {
      const { data: shopAfterRace } = await serviceClient
        .from("barbershops")
        .select("waba_connect_status")
        .eq("id", shop.id)
        .maybeSingle();

      if (shopAfterRace?.waba_connect_status === "connected") {
        return jsonResponse({
          success: true,
          status: "connected",
          message: "WhatsApp já está conectado.",
        });
      }

      throw exchangeErr;
    }

    const result = await completeMetaWabaConnect({
      serviceClient,
      shopId: shop.id,
      wabaId,
      phoneNumberId,
      flowType,
      accessToken,
      businessId,
      codeCapturedAtMs: Number.isFinite(codeCapturedAtMs) ? codeCapturedAtMs : null,
      completedVia: "frontend",
    });

    if (!result.ok) {
      const statusCode = result.status === "connected" || result.status === "provisioning" ? 409 : 502;
      return jsonResponse({ error: result.error, status: result.status }, statusCode);
    }

    if (result.status === "already_connected") {
      return jsonResponse({
        success: true,
        status: "connected",
        message: "WhatsApp já está conectado.",
      });
    }

    return jsonResponse({
      success: true,
      status: "connected",
      message: "WhatsApp conectado com sucesso.",
      verified_name: result.verified_name ?? null,
    });
  } catch (e) {
    console.error("[meta-waba-connect-start] Erro interno:", e);

    if (e instanceof Error && e.message.includes("META_APP")) {
      return jsonResponse({ error: "Configuração Meta ausente no servidor." }, 502);
    }

    return jsonResponse({
      error: e instanceof Error ? e.message : String(e),
    }, 502);
  }
});
