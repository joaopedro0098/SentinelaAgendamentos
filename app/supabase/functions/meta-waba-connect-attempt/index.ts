/**
 * POST /meta-waba-connect-attempt
 *
 * Camada adicional ao fluxo Embedded Signup (não substitui meta-waba-connect-start):
 * - action=start: registra tentativa antes de abrir popup
 * - action=submit_code: fast path — troca code, descobre WABA/número, completa conexão
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildKnownWabaIdsSnapshot,
  completeMetaWabaConnect,
  discoverFromExchangeableCode,
  fetchWabaPhoneNumbers,
  getMetaPartnerPollingConfig,
  parseFlowType,
  pickPhoneNumberIdForConnect,
} from "../_shared/metaWabaConnect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ATTEMPT_TTL_MS = 60 * 60 * 1000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAuthenticatedContext(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: jsonResponse({ error: "Não autenticado." }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { error: jsonResponse({ error: "Sessão inválida." }, 401) };
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: shop, error: shopErr } = await serviceClient
    .from("barbershops")
    .select("id, waba_connect_status")
    .eq("owner_id", userData.user.id)
    .maybeSingle();

  if (shopErr) return { error: jsonResponse({ error: shopErr.message }, 500) };
  if (!shop) return { error: jsonResponse({ error: "Empresa não encontrada." }, 404) };

  return { userId: userData.user.id, shop, serviceClient };
}

async function handleStart(serviceClient: ReturnType<typeof createClient>, shopId: string, ownerId: string) {
  const partner = getMetaPartnerPollingConfig();
  const snapshot = await buildKnownWabaIdsSnapshot(
    serviceClient,
    partner.systemUserAccessToken,
    partner.partnerBusinessId,
  );

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ATTEMPT_TTL_MS);

  await serviceClient
    .from("waba_connect_attempts")
    .update({
      status: "expired",
      error_message: "superseded_by_new_attempt",
      updated_at: now.toISOString(),
    })
    .eq("shop_id", shopId)
    .in("status", ["pending", "code_received"]);

  const { data, error } = await serviceClient
    .from("waba_connect_attempts")
    .insert({
      shop_id: shopId,
      owner_id: ownerId,
      status: "pending",
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      known_waba_ids_snapshot: snapshot,
      updated_at: now.toISOString(),
    })
    .select("id, expires_at")
    .single();

  if (error) {
    console.error("[meta-waba-connect-attempt] insert falhou:", error.message);
    return jsonResponse({ error: "Falha ao registrar tentativa de conexão." }, 500);
  }

  return jsonResponse({
    success: true,
    attempt_id: data.id,
    expires_at: data.expires_at,
  });
}

async function handleSubmitCode(
  serviceClient: ReturnType<typeof createClient>,
  shopId: string,
  ownerId: string,
  body: Record<string, unknown>,
) {
  const attemptId = String(body.attempt_id ?? "").trim();
  const code = String(body.code ?? "").trim();
  const codeCapturedAtMs = Number(body.code_captured_at_ms);

  const wabaIdHint = String(body.waba_id ?? "").trim() || null;
  const phoneNumberIdHint = String(body.phone_number_id ?? "").trim() || null;
  const businessIdHint = String(body.business_id ?? "").trim() || null;
  const flowTypeHint = parseFlowType(String(body.flow_type ?? "").trim());

  if (!attemptId || !code) {
    return jsonResponse({ error: "attempt_id e code são obrigatórios." }, 400);
  }

  const { data: attempt, error: attemptErr } = await serviceClient
    .from("waba_connect_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("shop_id", shopId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (attemptErr) return jsonResponse({ error: attemptErr.message }, 500);
  if (!attempt) return jsonResponse({ error: "Tentativa não encontrada." }, 404);
  if (attempt.status === "completed") {
    return jsonResponse({ success: true, status: "already_completed", via: attempt.completed_via });
  }
  if (attempt.status === "expired" || attempt.status === "ambiguous" || attempt.status === "failed") {
    return jsonResponse({ error: "Tentativa encerrada.", status: attempt.status }, 409);
  }

  const now = new Date().toISOString();
  await serviceClient
    .from("waba_connect_attempts")
    .update({
      status: "code_received",
      code_received_at: now,
      updated_at: now,
      discovered_waba_id: wabaIdHint ?? attempt.discovered_waba_id,
      discovered_phone_number_id: phoneNumberIdHint ?? attempt.discovered_phone_number_id,
      discovered_business_id: businessIdHint ?? attempt.discovered_business_id,
      discovered_flow_type: flowTypeHint ?? attempt.discovered_flow_type,
    })
    .eq("id", attemptId);

  try {
    const discovered = await discoverFromExchangeableCode(code);
    let wabaId = wabaIdHint ?? discovered.wabaId;
    if (wabaIdHint && wabaIdHint !== discovered.wabaId) {
      console.warn(
        `[meta-waba-connect-attempt] waba_id postMessage (${wabaIdHint}) difere do debug_token (${discovered.wabaId}); usando postMessage.`,
      );
      wabaId = wabaIdHint;
    }

    const flowType = flowTypeHint ?? parseFlowType(String(attempt.discovered_flow_type ?? "")) ??
      "new_phone_number";

    let phoneNumberId = phoneNumberIdHint ?? (String(attempt.discovered_phone_number_id ?? "").trim());

    if (!phoneNumberId && flowType !== "existing_phone_number") {
      const phones = await fetchWabaPhoneNumbers(discovered.accessToken, wabaId);
      phoneNumberId = pickPhoneNumberIdForConnect(phones, flowType) ?? "";
    }

    await serviceClient
      .from("waba_connect_attempts")
      .update({
        discovered_waba_id: wabaId,
        discovered_phone_number_id: phoneNumberId || null,
        discovered_meta_user_id: discovered.metaUserId,
        discovered_business_id: businessIdHint ?? attempt.discovered_business_id,
        discovered_flow_type: flowType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptId);

    if (!phoneNumberId && flowType !== "existing_phone_number") {
      console.log(
        `[meta-waba-connect-attempt] fast path aguardando phone_number_id shop=${shopId} waba=${wabaId}`,
      );
      return jsonResponse({
        success: true,
        status: "awaiting_phone_number",
        attempt_id: attemptId,
        waba_id: wabaId,
      });
    }

    const result = await completeMetaWabaConnect({
      serviceClient,
      shopId,
      wabaId,
      phoneNumberId,
      flowType,
      accessToken: discovered.accessToken,
      businessId: businessIdHint ?? attempt.discovered_business_id,
      codeCapturedAtMs: Number.isFinite(codeCapturedAtMs) ? codeCapturedAtMs : null,
      completedVia: "fast_path",
      attemptId,
    });

    if (!result.ok) {
      return jsonResponse({
        success: false,
        status: result.status ?? "error",
        error: result.error,
        attempt_id: attemptId,
      }, result.status === "provisioning" || result.status === "connected" ? 409 : 502);
    }

    return jsonResponse({
      success: true,
      status: result.status === "already_connected" ? "already_connected" : "connected",
      attempt_id: attemptId,
      via: "fast_path",
    });
  } catch (e) {
    console.error("[meta-waba-connect-attempt] fast path falhou (frontend ainda pode completar via postMessage):", e);
    return jsonResponse({
      success: false,
      status: "fast_path_failed",
      error: e instanceof Error ? e.message : String(e),
      attempt_id: attemptId,
    }, 202);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getAuthenticatedContext(req);
    if ("error" in ctx && ctx.error) return ctx.error;

    const { shop, serviceClient, userId } = ctx as {
      shop: { id: string; waba_connect_status: string };
      serviceClient: ReturnType<typeof createClient>;
      userId: string;
    };

    if (shop.waba_connect_status === "connected") {
      return jsonResponse({
        success: true,
        status: "already_connected",
        message: "WhatsApp já está conectado.",
      });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }

    const action = String(body.action ?? "").trim().toLowerCase();
    if (action === "start") {
      return await handleStart(serviceClient, shop.id, userId);
    }
    if (action === "submit_code") {
      return await handleSubmitCode(serviceClient, shop.id, userId, body);
    }

    return jsonResponse({ error: "action inválida. Use start ou submit_code." }, 400);
  } catch (e) {
    console.error("[meta-waba-connect-attempt] Erro interno:", e);
    return jsonResponse({
      error: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});
