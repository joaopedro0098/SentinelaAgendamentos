/**
 * POST /meta-waba-connect-start
 *
 * Embedded Signup Meta Direct (Tech Provider): subscribe, register, persist token.
 * Troca code→token só se a tentativa (attempt_id) não tiver token guardado; senão reutiliza o da 1ª submit_code.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  claimConnectAttemptForCompletion,
  completeMetaWabaConnect,
  exchangeCodeForAccessToken,
  parseFlowType,
  releaseConnectAttemptCompletionClaim,
} from "../_shared/metaWabaConnect.ts";
import { decryptWabaToken } from "../_shared/wabaCrypto.ts";

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
    const attemptId = String(body.attempt_id ?? "").trim() || null;

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

    let accessToken: string | null = null;
    let claimAttemptId: string | null = null;

    if (attemptId) {
      const { data: attempt, error: attemptErr } = await serviceClient
        .from("waba_connect_attempts")
        .select("id, shop_id, owner_id, status, oauth_access_token_encrypted")
        .eq("id", attemptId)
        .eq("shop_id", shop.id)
        .eq("owner_id", userData.user.id)
        .maybeSingle();

      if (attemptErr) return jsonResponse({ error: attemptErr.message }, 500);

      if (attempt) {
        if (attempt.status === "completed") {
          return jsonResponse({
            success: true,
            status: "connected",
            message: "WhatsApp já conectado nesta tentativa.",
          });
        }
        if (attempt.status === "completing") {
          return jsonResponse({
            success: true,
            status: "in_progress",
            message: "Conexão em andamento.",
          });
        }

        const storedEncrypted = String(attempt.oauth_access_token_encrypted ?? "").trim();
        if (storedEncrypted) {
          accessToken = await decryptWabaToken(storedEncrypted);
          claimAttemptId = attempt.id;
        }
      }
    }

    if (!accessToken) {
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
    }

    if (claimAttemptId) {
      const claim = await claimConnectAttemptForCompletion(serviceClient, claimAttemptId);
      if (!claim.ok) {
        if (claim.reason === "already_completed") {
          return jsonResponse({
            success: true,
            status: "connected",
            message: "WhatsApp já conectado.",
          });
        }
        if (claim.reason === "in_progress") {
          return jsonResponse({
            success: true,
            status: "in_progress",
            message: "Conexão em andamento.",
          });
        }
        return jsonResponse({ error: "Tentativa encerrada.", status: "closed" }, 409);
      }
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
      attemptId: claimAttemptId,
    });

    if (!result.ok) {
      if (claimAttemptId && result.status !== "provisioning") {
        await releaseConnectAttemptCompletionClaim(serviceClient, claimAttemptId);
      }
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
