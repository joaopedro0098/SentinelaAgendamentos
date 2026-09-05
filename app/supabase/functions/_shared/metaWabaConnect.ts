/**
 * Lógica compartilhada: Embedded Signup Meta Direct (oauth, subscribe, register, persist).
 * Usada por meta-waba-connect-start, meta-waba-connect-attempt e poll-waba-connect-attempts.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encryptWabaToken } from "./wabaCrypto.ts";
import { normalizeBrazilPhoneE164Digits } from "./twilioWhatsapp.ts";

export type WabaFlowType = "new_phone_number" | "only_waba" | "existing_phone_number";
export type WabaConnectCompletedVia = "frontend" | "fast_path" | "cron_poll";

type CoexSyncType = "smb_app_state_sync" | "history";

/** Campos WABA inscritos programaticamente (inclui coexistência). */
const WABA_SUBSCRIBED_FIELDS = [
  "account_update",
  "messages",
  "history",
  "smb_app_state_sync",
  "smb_message_echoes",
].join(",");

export function getMetaGraphConfig(): { appId: string; appSecret: string; apiVersion: string } {
  const appId = Deno.env.get("META_APP_ID")?.trim();
  const appSecret = Deno.env.get("META_APP_SECRET")?.trim();
  const apiVersion = Deno.env.get("META_GRAPH_API_VERSION")?.trim() || "v21.0";
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID ou META_APP_SECRET não configurados no servidor.");
  }
  return { appId, appSecret, apiVersion };
}

export function getMetaPartnerPollingConfig(): {
  partnerBusinessId: string | null;
  systemUserAccessToken: string | null;
  configured: boolean;
} {
  const partnerBusinessId = Deno.env.get("META_PARTNER_BUSINESS_ID")?.trim() || null;
  const systemUserAccessToken = Deno.env.get("META_SYSTEM_USER_ACCESS_TOKEN")?.trim() || null;
  return {
    partnerBusinessId,
    systemUserAccessToken,
    configured: Boolean(partnerBusinessId && systemUserAccessToken),
  };
}

export function parseFlowType(value: string): WabaFlowType | null {
  if (value === "new_phone_number" || value === "only_waba" || value === "existing_phone_number") {
    return value;
  }
  return null;
}

export function generateRegisterPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

export async function exchangeCodeForAccessToken(code: string): Promise<string> {
  const { appId, appSecret, apiVersion } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${apiVersion}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json().catch(() => ({})) as {
    access_token?: string;
    error?: { message?: string };
  };

  if (!res.ok || !data.access_token) {
    console.error("[metaWabaConnect] oauth/access_token falhou:", data);
    throw new Error(data.error?.message || "Falha ao trocar code por access token na Meta.");
  }

  return String(data.access_token);
}

export type DebugTokenGranularScope = {
  scope?: string;
  target_ids?: string[];
};

export type DebugTokenData = {
  user_id?: string;
  granular_scopes?: DebugTokenGranularScope[];
  is_valid?: boolean;
};

export async function debugAccessToken(inputToken: string, appAccessToken: string): Promise<DebugTokenData> {
  const { apiVersion } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${apiVersion}/debug_token`);
  url.searchParams.set("input_token", inputToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${appAccessToken}` },
  });

  const body = await res.json().catch(() => ({})) as { data?: DebugTokenData; error?: { message?: string } };
  if (!res.ok || !body.data) {
    console.error("[metaWabaConnect] debug_token falhou:", body);
    throw new Error(body.error?.message || "Falha ao inspecionar token na Meta (debug_token).");
  }

  return body.data;
}

/** WABA mais recente concedida ao app (primeiro target_id de whatsapp_business_management). */
export function extractPrimaryWabaIdFromDebugToken(data: DebugTokenData): string | null {
  const scopes = data.granular_scopes ?? [];
  const wabaScope = scopes.find((s) => s.scope === "whatsapp_business_management");
  const targetId = wabaScope?.target_ids?.[0];
  return targetId ? String(targetId).trim() : null;
}

export type ClientWabaAccount = {
  id: string;
  name?: string;
  owner_business_info?: { id?: string; name?: string };
};

export async function fetchClientWhatsappBusinessAccounts(
  accessToken: string,
  partnerBusinessId: string,
): Promise<ClientWabaAccount[]> {
  const { apiVersion } = getMetaGraphConfig();
  const fields = "id,name,owner_business_info";
  const url = new URL(
    `https://graph.facebook.com/${apiVersion}/${partnerBusinessId}/client_whatsapp_business_accounts`,
  );
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "100");

  const accounts: ClientWabaAccount[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json().catch(() => ({})) as {
      data?: ClientWabaAccount[];
      paging?: { next?: string };
      error?: { message?: string };
    };

    if (!res.ok) {
      console.error("[metaWabaConnect] client_whatsapp_business_accounts falhou:", data);
      throw new Error(data.error?.message || "Falha ao listar WABAs do portfolio parceiro.");
    }

    accounts.push(...(data.data ?? []));
    nextUrl = data.paging?.next ?? null;
  }

  return accounts;
}

export type WabaPhoneNumber = {
  id: string;
  display_phone_number?: string;
  status?: string;
  quality_rating?: string;
  verified_name?: string;
};

export async function fetchWabaPhoneNumbers(
  accessToken: string,
  wabaId: string,
): Promise<WabaPhoneNumber[]> {
  const { apiVersion } = getMetaGraphConfig();
  const fields = "id,display_phone_number,status,quality_rating,verified_name";
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "50");

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json().catch(() => ({})) as {
    data?: WabaPhoneNumber[];
    error?: { message?: string };
  };

  if (!res.ok) {
    console.error("[metaWabaConnect] phone_numbers falhou:", data);
    throw new Error(data.error?.message || "Falha ao listar números da WABA.");
  }

  return data.data ?? [];
}

/** Escolhe phone_number_id pendente de registro; fallback para o primeiro disponível. */
export function pickPhoneNumberIdForConnect(
  phones: WabaPhoneNumber[],
  flowType: WabaFlowType,
): string | null {
  if (phones.length === 0) return null;

  const pending = phones.find((p) => {
    const status = String(p.status ?? "").toUpperCase();
    return status === "PENDING" || status === "UNVERIFIED" || status === "";
  });
  if (pending?.id) return String(pending.id);

  if (flowType === "only_waba") return null;

  const notConnected = phones.find((p) => String(p.status ?? "").toUpperCase() !== "CONNECTED");
  if (notConnected?.id) return String(notConnected.id);

  return String(phones[0].id);
}

export async function subscribeWabaToApp(accessToken: string, wabaId: string): Promise<void> {
  const { apiVersion } = getMetaGraphConfig();
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", WABA_SUBSCRIBED_FIELDS);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || data.success === false) {
    console.error("[metaWabaConnect] subscribed_apps falhou:", data);
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

export async function runCoexistenceSyncBestEffort(
  accessToken: string,
  phoneNumberId: string,
  shopId: string,
  serviceClient: SupabaseClient,
): Promise<void> {
  let contactsRequestId: string | null = null;
  let historyRequestId: string | null = null;

  const contactsSync = await postSmbAppDataSync(accessToken, phoneNumberId, "smb_app_state_sync");
  if (contactsSync.ok) {
    contactsRequestId = contactsSync.request_id;
    console.log(
      `[metaWabaConnect] smb_app_data contacts iniciado shop=${shopId} request_id=${contactsRequestId}`,
    );
  } else {
    console.error(
      `[metaWabaConnect] smb_app_data contacts falhou shop=${shopId}:`,
      contactsSync.detail,
    );
  }

  const historySync = await postSmbAppDataSync(accessToken, phoneNumberId, "history");
  if (historySync.ok) {
    historyRequestId = historySync.request_id;
    console.log(
      `[metaWabaConnect] smb_app_data history iniciado shop=${shopId} request_id=${historyRequestId}`,
    );
  } else {
    console.error(
      `[metaWabaConnect] smb_app_data history falhou shop=${shopId}:`,
      historySync.detail,
    );
  }

  if (!contactsRequestId && !historyRequestId) return;

  const coexUpdate: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (contactsRequestId) coexUpdate.waba_coex_contacts_sync_request_id = contactsRequestId;
  if (historyRequestId) coexUpdate.waba_coex_history_sync_request_id = historyRequestId;

  const { error } = await serviceClient.from("barbershops").update(coexUpdate).eq("id", shopId);
  if (error) {
    console.error(`[metaWabaConnect] falha ao persistir request_id coexistência shop=${shopId}:`, error.message);
  }
}

export async function registerPhoneNumber(
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
    console.error("[metaWabaConnect] register falhou:", data);
    throw new Error(data.error?.message || "Falha ao registrar número na Meta.");
  }
}

export async function fetchPhoneNumberMetadata(
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
    console.error("[metaWabaConnect] GET phone_number falhou:", data);
    throw new Error(data.error?.message || "Falha ao obter metadados do número na Meta.");
  }

  return data;
}

export async function fetchKnownWabaIdsFromDb(serviceClient: SupabaseClient): Promise<string[]> {
  const { data, error } = await serviceClient
    .from("barbershops")
    .select("waba_id")
    .not("waba_id", "is", null);

  if (error) {
    console.error("[metaWabaConnect] falha ao listar waba_id do DB:", error.message);
    return [];
  }

  return [...new Set(
    (data ?? [])
      .map((row) => String(row.waba_id ?? "").trim())
      .filter(Boolean),
  )];
}

export async function buildKnownWabaIdsSnapshot(
  serviceClient: SupabaseClient,
  partnerAccessToken?: string | null,
  partnerBusinessId?: string | null,
): Promise<string[]> {
  const known = new Set(await fetchKnownWabaIdsFromDb(serviceClient));

  if (partnerAccessToken && partnerBusinessId) {
    try {
      const accounts = await fetchClientWhatsappBusinessAccounts(partnerAccessToken, partnerBusinessId);
      for (const account of accounts) {
        if (account.id) known.add(String(account.id));
      }
    } catch (e) {
      console.warn("[metaWabaConnect] snapshot portfolio Meta indisponível:", e);
    }
  }

  return [...known];
}

export type DiscoverFromCodeResult = {
  accessToken: string;
  wabaId: string;
  metaUserId: string | null;
};

export async function discoverFromExchangeableCode(code: string): Promise<DiscoverFromCodeResult> {
  const accessToken = await exchangeCodeForAccessToken(code);
  const { appId, appSecret, apiVersion } = getMetaGraphConfig();
  const appAccessToken = `${appId}|${appSecret}`;
  const debug = await debugAccessToken(accessToken, appAccessToken);
  const wabaId = extractPrimaryWabaIdFromDebugToken(debug);

  if (!wabaId) {
    throw new Error("Meta não retornou waba_id via debug_token após troca do code.");
  }

  return {
    accessToken,
    wabaId,
    metaUserId: debug.user_id ? String(debug.user_id) : null,
  };
}

/** Primeiro id em GET /{waba_id}/phone_numbers (Meta Client phone numbers). */
export async function resolveFirstPhoneNumberIdFromWaba(
  accessToken: string,
  wabaId: string,
): Promise<string> {
  const phones = await fetchWabaPhoneNumbers(accessToken, wabaId);
  const firstId = phones[0]?.id;
  if (!firstId) {
    throw new Error("Meta não retornou números em GET /{waba_id}/phone_numbers.");
  }
  return String(firstId);
}

/** Resolve phone_number_id; coexistência sem id no payload usa o primeiro número da WABA. */
export async function resolvePhoneNumberIdForConnect(
  accessToken: string,
  wabaId: string,
  flowType: WabaFlowType,
  phoneNumberId: string,
): Promise<string> {
  const trimmed = String(phoneNumberId ?? "").trim();
  if (trimmed) return trimmed;

  if (flowType === "existing_phone_number") {
    return await resolveFirstPhoneNumberIdFromWaba(accessToken, wabaId);
  }

  throw new Error("phone_number_id é obrigatório para este fluxo.");
}

export type CompleteMetaWabaConnectParams = {
  serviceClient: SupabaseClient;
  shopId: string;
  wabaId: string;
  phoneNumberId: string;
  flowType: WabaFlowType;
  accessToken: string;
  businessId?: string | null;
  codeCapturedAtMs?: number | null;
  completedVia: WabaConnectCompletedVia;
  attemptId?: string | null;
};

export type CompleteMetaWabaConnectResult =
  | { ok: true; status: "connected"; verified_name?: string | null }
  | { ok: true; status: "already_connected" }
  | { ok: false; error: string; status?: string };

export async function markConnectAttemptsCompleted(
  serviceClient: SupabaseClient,
  shopId: string,
  completedVia: WabaConnectCompletedVia,
  attemptId?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const patch = {
    status: "completed",
    completed_at: now,
    completed_via: completedVia,
    updated_at: now,
  };

  if (attemptId) {
    await serviceClient.from("waba_connect_attempts").update(patch).eq("id", attemptId);
    return;
  }

  await serviceClient
    .from("waba_connect_attempts")
    .update(patch)
    .eq("shop_id", shopId)
    .in("status", ["pending", "code_received"]);
}

export async function completeMetaWabaConnect(
  params: CompleteMetaWabaConnectParams,
): Promise<CompleteMetaWabaConnectResult> {
  const {
    serviceClient,
    shopId,
    wabaId,
    phoneNumberId,
    flowType,
    accessToken,
    businessId,
    codeCapturedAtMs,
    completedVia,
    attemptId,
  } = params;

  let resolvedPhoneNumberId: string;
  try {
    resolvedPhoneNumberId = await resolvePhoneNumberIdForConnect(
      accessToken,
      wabaId,
      flowType,
      phoneNumberId,
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const { data: shop, error: shopErr } = await serviceClient
    .from("barbershops")
    .select("id, waba_id, waba_phone_number_id, waba_register_pin, waba_connect_status, updated_at")
    .eq("id", shopId)
    .maybeSingle();

  if (shopErr) return { ok: false, error: shopErr.message };
  if (!shop) return { ok: false, error: "Empresa não encontrada." };

  const currentStatus = String(shop.waba_connect_status ?? "");
  const currentWabaId = String(shop.waba_id ?? "").trim();

  if (currentStatus === "connected") {
    if (currentWabaId === wabaId) {
      await markConnectAttemptsCompleted(serviceClient, shopId, completedVia, attemptId);
      return { ok: true, status: "already_connected" };
    }
    return {
      ok: false,
      error: "Desconecte o WhatsApp atual antes de conectar outra conta.",
      status: "connected",
    };
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
      waba_phone_number_id: resolvedPhoneNumberId,
      waba_connected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId)
    .or(filterStr)
    .select("id, waba_register_pin, waba_phone_number_id");

  if (lockErr) return { ok: false, error: lockErr.message };

  if (!lockData?.length) {
    if (currentStatus === "provisioning") {
      return {
        ok: false,
        error: "Conexão em andamento. Aguarde alguns minutos e tente novamente.",
        status: "provisioning",
      };
    }
    return {
      ok: false,
      error: "Não foi possível iniciar a conexão neste momento.",
      status: currentStatus || undefined,
    };
  }

  const lockedRow = lockData[0];

  if (codeCapturedAtMs != null && Number.isFinite(codeCapturedAtMs) && codeCapturedAtMs > 0) {
    const codeAgeMs = Date.now() - codeCapturedAtMs;
    console.log(
      `[metaWabaConnect] code capturado há ${codeAgeMs}ms shop=${shopId} via=${completedVia}`,
    );
  }

  try {
    await subscribeWabaToApp(accessToken, wabaId);

    let registerPin = String(lockedRow.waba_register_pin ?? shop.waba_register_pin ?? "").trim();
    const samePhoneAsStored = String(lockedRow.waba_phone_number_id ?? shop.waba_phone_number_id ?? "") ===
      resolvedPhoneNumberId;

    if (flowType !== "existing_phone_number") {
      if (!registerPin || !samePhoneAsStored) {
        registerPin = generateRegisterPin();
      }
      await registerPhoneNumber(accessToken, resolvedPhoneNumberId, registerPin);
    }

    const phoneMeta = await fetchPhoneNumberMetadata(accessToken, resolvedPhoneNumberId);
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
        waba_phone_number_id: resolvedPhoneNumberId,
        waba_access_token_encrypted: encryptedToken,
        waba_register_pin: flowType !== "existing_phone_number" ? registerPin : lockedRow.waba_register_pin,
        waba_flow_type: flowType,
        waba_business_id: businessId ?? null,
        whatsapp_messaging_provider: "meta",
        sender_phone_e164: displayDigits,
        updated_at: now,
      })
      .eq("id", shopId);

    if (updateErr) {
      console.error("[metaWabaConnect] falha UPDATE:", updateErr.message);
      await serviceClient.from("barbershops").update({
        waba_connect_status: "error",
        updated_at: new Date().toISOString(),
      }).eq("id", shopId);
      return { ok: false, error: "Falha ao persistir conexão." };
    }

    if (flowType === "existing_phone_number") {
      await runCoexistenceSyncBestEffort(accessToken, resolvedPhoneNumberId, shopId, serviceClient);
    }

    await markConnectAttemptsCompleted(serviceClient, shopId, completedVia, attemptId);

    return { ok: true, status: "connected", verified_name: phoneMeta.verified_name ?? null };
  } catch (e) {
    console.error("[metaWabaConnect] Erro ao completar conexão:", e);
    await serviceClient.from("barbershops").update({
      waba_connect_status: "error",
      updated_at: new Date().toISOString(),
    }).eq("id", shopId);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type WabaConnectAttemptRow = {
  id: string;
  shop_id: string;
  owner_id: string;
  status: string;
  started_at: string;
  expires_at: string;
  discovered_waba_id: string | null;
  discovered_phone_number_id: string | null;
  discovered_business_id: string | null;
  discovered_meta_user_id: string | null;
  discovered_flow_type: string | null;
  known_waba_ids_snapshot: string[] | null;
};

export type MatchNewWabaResult =
  | { kind: "matched"; wabaId: string; reason: string }
  | { kind: "ambiguous"; candidateWabaIds: string[]; reason: string }
  | { kind: "none"; reason: string };

/** Diff + regras de desambiguação para polling (volume baixo de conexões simultâneas). */
export function matchNewWabaForAttempt(
  attempt: WabaConnectAttemptRow,
  portfolioWabas: ClientWabaAccount[],
  knownWabaIds: Set<string>,
  openAttemptsCount: number,
): MatchNewWabaResult {
  if (attempt.discovered_waba_id) {
    const wabaId = String(attempt.discovered_waba_id).trim();
    if (wabaId && !knownWabaIds.has(wabaId)) {
      return { kind: "matched", wabaId, reason: "discovered_waba_id_from_fast_path" };
    }
  }

  const newWabas = portfolioWabas.filter((w) => {
    const id = String(w.id ?? "").trim();
    return id && !knownWabaIds.has(id);
  });

  if (newWabas.length === 0) {
    return { kind: "none", reason: "no_new_wabas_in_portfolio_diff" };
  }

  const businessId = String(attempt.discovered_business_id ?? "").trim();
  let candidates = newWabas;

  if (businessId) {
    const byBusiness = newWabas.filter(
      (w) => String(w.owner_business_info?.id ?? "").trim() === businessId,
    );
    if (byBusiness.length === 1) {
      return {
        kind: "matched",
        wabaId: String(byBusiness[0].id),
        reason: "owner_business_info_match",
      };
    }
    if (byBusiness.length > 1) {
      return {
        kind: "ambiguous",
        candidateWabaIds: byBusiness.map((w) => String(w.id)),
        reason: `multiple_new_wabas_for_business_id=${businessId}`,
      };
    }
    if (byBusiness.length === 0 && newWabas.length > 0) {
      return {
        kind: "ambiguous",
        candidateWabaIds: newWabas.map((w) => String(w.id)),
        reason: `business_id=${businessId}_without_matching_waba`,
      };
    }
  }

  if (candidates.length === 1 && openAttemptsCount === 1) {
    return {
      kind: "matched",
      wabaId: String(candidates[0].id),
      reason: "single_new_waba_single_open_attempt",
    };
  }

  if (candidates.length > 1 && openAttemptsCount === 1) {
    return {
      kind: "ambiguous",
      candidateWabaIds: candidates.map((w) => String(w.id)),
      reason: "multiple_new_wabas_single_open_attempt",
    };
  }

  if (candidates.length >= 1 && openAttemptsCount > 1) {
    return {
      kind: "ambiguous",
      candidateWabaIds: candidates.map((w) => String(w.id)),
      reason: `multiple_open_attempts=${openAttemptsCount}`,
    };
  }

  return { kind: "none", reason: "no_match_rule_matched" };
}

export type ServiceClient = ReturnType<typeof createClient>;
