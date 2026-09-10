/**
 * Smoke test: waba-disconnect (provider meta)
 *
 * Pré-requisito: barbearia de teste conectada via Meta Direct (status=connected,
 * whatsapp_messaging_provider=meta, waba_id + waba_access_token_encrypted preenchidos).
 *
 * Uso (PowerShell, na pasta app/):
 *   $env:META_SMOKE_ACCESS_TOKEN="<token com acesso à WABA>"
 *   $env:META_SMOKE_WABA_ID="1423059269697538"
 *   node supabase/scripts/smoke-meta-waba-disconnect.mjs
 *
 * Opcional: META_GRAPH_API_VERSION (default v21.0), META_APP_ID (default do projeto)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://zdmecbyyfubpmwrzzbqf.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkbWVjYnl5ZnVicG13cnp6YnFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MTk3NzQsImV4cCI6MjA5Mjk5NTc3NH0.Tn24dRo-fwvlKWO_7Qd_YzEq4VDtP1efEZrrapFtgjY";

const SHOP_ID = process.env.META_SMOKE_SHOP_ID ?? "78d6e7e3-b8a9-45f3-b421-9e567bf24458";
const OWNER_ID = process.env.META_SMOKE_OWNER_ID ?? "b31a6a89-55a8-431b-b0c4-764071270390";
const META_APP_ID = process.env.META_APP_ID ?? "2136245233992856";
const API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v21.0";

const SHOP_SELECT =
  "id, waba_connect_status, whatsapp_messaging_provider, waba_id, waba_phone_number_id, waba_access_token_encrypted, waba_register_pin, waba_flow_type, waba_business_id, waba_coex_contacts_sync_request_id, waba_coex_history_sync_request_id, waba_connected_at";

function loadServiceRoleKey() {
  const raw = readFileSync(join(tmpdir(), "sb-keys.json"), "utf8");
  const jsonStart = raw.indexOf("[");
  const jsonEnd = raw.lastIndexOf("]");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("sb-keys.json inválido");
  const keys = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  const entry = keys.find((k) => k.name === "service_role");
  if (!entry?.api_key) throw new Error("service_role não encontrado");
  return entry.api_key;
}

async function ownerJwt(admin) {
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(OWNER_ID);
  if (userErr || !userData.user?.email) {
    throw new Error(`Usuário owner não encontrado: ${userErr?.message ?? "sem email"}`);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    throw new Error(`generateLink falhou: ${linkErr?.message ?? "sem token"}`);
  }

  const anon = createClient(PROJECT_URL, ANON_KEY);
  const { data: sessionData, error: sessionErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (sessionErr || !sessionData.session?.access_token) {
    throw new Error(`verifyOtp falhou: ${sessionErr?.message ?? "sem session"}`);
  }

  return sessionData.session.access_token;
}

async function fetchSubscribedApps(wabaId, accessToken) {
  const url = `https://graph.facebook.com/${API_VERSION}/${wabaId}/subscribed_apps`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function appIsSubscribed(subscribedBody) {
  const data = subscribedBody?.data;
  if (!Array.isArray(data)) return false;
  return data.some((entry) => String(entry?.id ?? entry?.whatsapp_business_api_data?.id ?? "") === META_APP_ID);
}

function isShopFullyCleared(shop) {
  return (
    shop.waba_connect_status === "not_connected" &&
    shop.whatsapp_messaging_provider === null &&
    shop.waba_id === null &&
    shop.waba_phone_number_id === null &&
    shop.waba_access_token_encrypted === null &&
    shop.waba_register_pin === null &&
    shop.waba_flow_type === null &&
    shop.waba_business_id === null &&
    shop.waba_coex_contacts_sync_request_id === null &&
    shop.waba_coex_history_sync_request_id === null &&
    shop.waba_connected_at === null
  );
}

async function main() {
  const graphToken = process.env.META_SMOKE_ACCESS_TOKEN?.trim();
  const graphWabaId = process.env.META_SMOKE_WABA_ID?.trim();

  if (!graphToken || !graphWabaId) {
    console.error(
      "Defina META_SMOKE_ACCESS_TOKEN e META_SMOKE_WABA_ID para verificar subscribed_apps na Graph API.",
    );
    process.exit(1);
  }

  const serviceRole = loadServiceRoleKey();
  const admin = createClient(PROJECT_URL, serviceRole);

  const { data: before, error: beforeErr } = await admin
    .from("barbershops")
    .select(SHOP_SELECT)
    .eq("id", SHOP_ID)
    .single();

  if (beforeErr) throw beforeErr;

  if (before.waba_connect_status !== "connected" || before.whatsapp_messaging_provider !== "meta") {
    console.error(
      "SMOKE SKIP: conecte a barbearia de teste via Meta Direct antes (status=connected, provider=meta).",
      before,
    );
    process.exit(1);
  }

  if (String(before.waba_id ?? "") !== graphWabaId) {
    console.warn(
      `Aviso: waba_id no banco (${before.waba_id}) difere de META_SMOKE_WABA_ID (${graphWabaId}). Usando env para Graph API.`,
    );
  }

  const subscribedBefore = await fetchSubscribedApps(graphWabaId, graphToken);
  console.log("subscribed_apps ANTES:", subscribedBefore.status, JSON.stringify(subscribedBefore.body));

  const jwt = await ownerJwt(admin);

  const res = await fetch(`${PROJECT_URL}/functions/v1/waba-disconnect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  const disconnectBody = await res.json().catch(() => ({}));
  console.log("waba-disconnect HTTP", res.status, JSON.stringify(disconnectBody));

  const { data: after, error: afterErr } = await admin
    .from("barbershops")
    .select(SHOP_SELECT)
    .eq("id", SHOP_ID)
    .single();

  if (afterErr) throw afterErr;
  console.log("DB depois:", JSON.stringify(after));

  const dbOk = isShopFullyCleared(after);
  if (!dbOk) {
    console.error("SMOKE FAIL: campos Meta não foram limpos completamente.");
    process.exit(1);
  }

  const subscribedAfter = await fetchSubscribedApps(graphWabaId, graphToken);
  console.log("subscribed_apps DEPOIS:", subscribedAfter.status, JSON.stringify(subscribedAfter.body));

  const stillSubscribed = subscribedAfter.ok && appIsSubscribed(subscribedAfter.body);
  if (stillSubscribed) {
    console.error("SMOKE FAIL: app ainda aparece em subscribed_apps após disconnect.");
    process.exit(1);
  }

  if (!res.ok || disconnectBody.success !== true) {
    console.error("SMOKE FAIL: waba-disconnect não retornou success.");
    process.exit(1);
  }

  console.log("SMOKE OK: disconnect Meta limpou banco e removeu subscribed_apps.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
