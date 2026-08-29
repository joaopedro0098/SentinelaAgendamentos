/**
 * POST /meta-waba-connect-start
 *
 * Embedded Signup Meta Direct (Tech Provider): troca code, subscribed_apps, register, persist token.
 * Coexistência (existing_phone_number): smb_app_data contacts + history (best-effort pós-connected).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encryptWabaToken } from "../_shared/wabaCrypto.ts";
import { normalizeBrazilPhoneE164Digits } from "../_shared/twilioWhatsapp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WabaFlowType = "new_phone_number" | "only_waba" | "existing_phone_number";
type CoexSyncType = "smb_app_state_sync" | "history";

/** Campos WABA inscritos programaticamente (inclui coexistência). */
const WABA_SUBSCRIBED_FIELDS = [
  "account_update",
  "messages",
  "history",
  "smb_app_state_sync",
  "smb_message_echoes",
].join(",");

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getMetaGraphConfig(): { appId: string; appSecret: string; apiVersion: string } {
  const appId = Deno.env.get("META_APP_ID")?.trim();
  const appSecret = Deno.env.get("META_APP_SECRET")?.trim();
  const apiVersion = Deno.env.get("META_GRAPH_API_VERSION")?.trim() || "v21.0";
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID ou META_APP_SECRET não configurados no servidor.");
  }
  return { appId, appSecret, apiVersion };
}

function generateRegisterPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

async function exchangeCodeForAccessToken(
  code: string,
): Promise<string> {
  const { appId, appSecret, apiVersion } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${apiVersion}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({})) as { access_token?: string; error?: { message?: string } };

  if (!res.ok || !data.access_token) {
    console.error("[meta-waba-connect-start] oauth/access_token falhou:", data);
    throw new Error(data.error?.message || "Falha ao trocar code por access token na Meta.");
  }

  return String(data.access_token);
}

async function subscribeWabaToApp(accessToken: string, wabaId: string): Promise<void> {
  const { apiVersion } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", WABA_SUBSCRIBED_FIELDS);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || data.success === false) {
    console.error("[meta-waba-connect-start] subscribed_apps falhou:", data);
    throw new Error(data.error?.message || "Falha ao inscrever app nos webhooks da WABA.");
  }
}

type SmbAppDataSyncResult =
  | { ok: true; request_id: string }
  | { ok: false; detail: unknown };

async function postSmbAppDataSync(
  accessToken: string,
  phoneNumberId: string,
  syncType: CoexSyncType,
): Promise<SmbAppDataSyncResult> {
  const { apiVersion } = getMetaGraphConfig();
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/smb_app_data`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      sync_type: syncType,
    }),
  });

  const data = await res.json().catch(() => ({})) as {
    request_id?: string;
    error?: { message?: string; code?: number };
  };

  if (!res.ok || !data.request_id) {
    return { ok: false, detail: data };
  }

  return { ok: true, request_id: String(data.request_id) };
}

async function runCoexistenceSyncBestEffort(
  accessToken: string,
  phoneNumberId: string,
  shopId: string,
  serviceClient: ReturnType<typeof createClient>,
): Promise<void> {
  let contactsRequestId: string | null = null;
  let historyRequestId: string | null = null;

  const contactsSync = await postSmbAppDataSync(accessToken, phoneNumberId, "smb_app_state_sync");
  if (contactsSync.ok) {
    contactsRequestId = contactsSync.request_id;
    console.log(
      `[meta-waba-connect-start] smb_app_data contacts iniciado shop=${shopId} request_id=${contactsRequestId}`,
    );
  } else {
    console.error(
      `[meta-waba-connect-start] smb_app_data contacts falhou, sync perdida até novo onboarding shop=${shopId}:`,
      contactsSync.detail,
    );
  }

  const historySync = await postSmbAppDataSync(accessToken, phoneNumberId, "history");
  if (historySync.ok) {
    historyRequestId = historySync.request_id;
    console.log(
      `[meta-waba-connect-start] smb_app_data history iniciado shop=${shopId} request_id=${historyRequestId}`,
    );
  } else {
    console.error(
      `[meta-waba-connect-start] smb_app_data history falhou, sync perdida até novo onboarding shop=${shopId}:`,
      historySync.detail,
    );
  }

  if (!contactsRequestId && !historyRequestId) return;

  const coexUpdate: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (contactsRequestId) {
    coexUpdate.waba_coex_contacts_sync_request_id = contactsRequestId;
  }
  if (historyRequestId) {
    coexUpdate.waba_coex_history_sync_request_id = historyRequestId;
  }

  const { error } = await serviceClient
    .from("barbershops")
    .update(coexUpdate)
    .eq("id", shopId);

  if (error) {
    console.error(
      `[meta-waba-connect-start] falha ao persistir request_id de coexistência shop=${shopId}:`,
      error.message,
    );
  }
}

async function registerPhoneNumber(
  accessToken: string,
  phoneNumberId: string,
  pin: string,
): Promise<void> {
  const { apiVersion } = getMetaGraphConfig();
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin,
    }),
  });

  const data = await res.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || data.success === false) {
    console.error("[meta-waba-connect-start] register falhou:", data);
    throw new Error(data.error?.message || "Falha ao registrar número na Meta.");
  }
}

async function fetchPhoneNumberMetadata(
  accessToken: string,
  phoneNumberId: string,
): Promise<{ verified_name?: string; display_phone_number?: string; quality_rating?: string }> {
  const { apiVersion } = getMetaGraphConfig();
  const fields = "verified_name,display_phone_number,quality_rating";
  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  const data = await res.json().catch(() => ({})) as {
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
    error?: { message?: string };
  };

  if (!res.ok) {
    console.error("[meta-waba-connect-start] GET phone_number falhou:", data);
    throw new Error(data.error?.message || "Falha ao obter metadados do número na Meta.");
  }

  return data;
}

function parseFlowType(value: string): WabaFlowType | null {
  if (value === "new_phone_number" || value === "only_waba" || value === "existing_phone_number") {
    return value;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let shopId: string | null = null;
  let serviceClient: ReturnType<typeof createClient> | null = null;

  const revertLock = async (status: "not_connected" | "error") => {
    if (!serviceClient || !shopId) return;
    try {
      await serviceClient.from("barbershops").update({
        waba_connect_status: status,
        updated_at: new Date().toISOString(),
      }).eq("id", shopId);
    } catch (e) {
      console.error("[meta-waba-connect-start] Erro ao reverter lock:", e);
    }
  };

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
    if (!code || !wabaId || !phoneNumberId || !flowType) {
      return jsonResponse({
        error: "Campos code, waba_id, phone_number_id e flow_type válido são obrigatórios.",
      }, 400);
    }

    serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: shop, error: shopErr } = await serviceClient
      .from("barbershops")
      .select("id, waba_id, waba_phone_number_id, waba_register_pin, waba_connect_status, updated_at")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (shopErr) return jsonResponse({ error: shopErr.message }, 500);
    if (!shop) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    shopId = shop.id;
    const currentStatus = String(shop.waba_connect_status ?? "");
    const currentWabaId = String(shop.waba_id ?? "").trim();

    if (currentStatus === "connected") {
      if (currentWabaId === wabaId) {
        return jsonResponse({
          success: true,
          status: "connected",
          message: "WhatsApp já está conectado.",
        });
      }
      return jsonResponse({
        error: "Desconecte o WhatsApp atual antes de conectar outra conta.",
        status: "connected",
      }, 409);
    }

    const lockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const filterStr =
      `waba_connect_status.eq.not_connected,` +
      `waba_connect_status.eq.error,` +
      `waba_connect_status.eq.token_expired,` +
      `and(waba_connect_status.eq.provisioning,updated_at.lt.${lockCutoff})`;

    const { data: lockData, error: lockErr } = await serviceClient
      .from("barbershops")
      .update({
        waba_connect_status: "provisioning",
        waba_id: wabaId,
        waba_phone_number_id: phoneNumberId,
        waba_connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId)
      .or(filterStr)
      .select("id, waba_register_pin, waba_phone_number_id");

    if (lockErr) return jsonResponse({ error: lockErr.message }, 500);

    if (!lockData?.length) {
      if (currentStatus === "provisioning") {
        return jsonResponse({
          error: "Conexão em andamento. Aguarde alguns minutos e tente novamente.",
          status: "provisioning",
        }, 409);
      }
      return jsonResponse({
        error: "Não foi possível iniciar a conexão neste momento.",
        status: currentStatus || undefined,
      }, 409);
    }

    const lockedRow = lockData[0];

    const codeCapturedAtMs = Number(body.code_captured_at_ms);
    const codeAgeMs = Number.isFinite(codeCapturedAtMs) && codeCapturedAtMs > 0
      ? Date.now() - codeCapturedAtMs
      : null;
    if (codeAgeMs !== null) {
      console.log(
        `[meta-waba-connect-start] code capturado há ${codeAgeMs}ms, iniciando troca oauth/access_token shop=${shopId}`,
      );
      if (codeAgeMs > 25_000) {
        console.warn(
          `[meta-waba-connect-start] code próximo ou expirado (>25s, limite Meta ~30s) shop=${shopId} age=${codeAgeMs}ms`,
        );
      }
    } else {
      console.log(
        `[meta-waba-connect-start] code_captured_at_ms ausente, iniciando troca oauth/access_token shop=${shopId}`,
      );
    }

    const accessToken = await exchangeCodeForAccessToken(code);
    await subscribeWabaToApp(accessToken, wabaId);

    let registerPin = String(lockedRow.waba_register_pin ?? shop.waba_register_pin ?? "").trim();
    const samePhoneAsStored = String(lockedRow.waba_phone_number_id ?? shop.waba_phone_number_id ?? "") ===
      phoneNumberId;

    if (flowType !== "existing_phone_number") {
      if (!registerPin || !samePhoneAsStored) {
        registerPin = generateRegisterPin();
      }
      await registerPhoneNumber(accessToken, phoneNumberId, registerPin);
    }

    const phoneMeta = await fetchPhoneNumberMetadata(accessToken, phoneNumberId);
    const encryptedToken = await encryptWabaToken(accessToken);
    const now = new Date().toISOString();

    const displayDigits = phoneMeta.display_phone_number
      ? normalizeBrazilPhoneE164Digits(phoneMeta.display_phone_number)
      : null;

    const { error: updateErr } = await serviceClient
      .from("barbershops")
      .update({
        waba_connect_status: "connected",
        waba_connected_at: now,
        waba_id: wabaId,
        waba_phone_number_id: phoneNumberId,
        waba_access_token_encrypted: encryptedToken,
        waba_register_pin: flowType !== "existing_phone_number" ? registerPin : lockedRow.waba_register_pin,
        waba_flow_type: flowType,
        waba_business_id: businessId,
        whatsapp_messaging_provider: "meta",
        sender_phone_e164: displayDigits,
        updated_at: now,
      })
      .eq("id", shopId);

    if (updateErr) {
      console.error("[meta-waba-connect-start] falha UPDATE:", updateErr.message);
      await revertLock("error");
      return jsonResponse({ error: "Falha ao persistir conexão." }, 500);
    }

    if (flowType === "existing_phone_number") {
      await runCoexistenceSyncBestEffort(accessToken, phoneNumberId, shopId, serviceClient);
    }

    return jsonResponse({
      success: true,
      status: "connected",
      message: "WhatsApp conectado com sucesso.",
      verified_name: phoneMeta.verified_name ?? null,
    });
  } catch (e) {
    console.error("[meta-waba-connect-start] Erro interno:", e);

    if (e instanceof Error && e.message.includes("META_APP")) {
      if (shopId && serviceClient) await revertLock("error");
      return jsonResponse({ error: "Configuração Meta ausente no servidor." }, 502);
    }

    if (shopId && serviceClient) {
      await revertLock("error");
    }

    return jsonResponse({
      error: e instanceof Error ? e.message : String(e),
    }, 502);
  }
});
