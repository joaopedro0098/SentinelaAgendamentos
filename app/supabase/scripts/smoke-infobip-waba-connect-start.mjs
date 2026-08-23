/**
 * Smoke test remoto: infobip-waba-connect-start
 * Uso (PowerShell, na pasta app/):
 *   node supabase/scripts/smoke-infobip-waba-connect-start.mjs
 *
 * Requer supabase projects api-keys (service_role) e barbershop com owner_id.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://zdmecbyyfubpmwrzzbqf.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkbWVjYnl5ZnVicG13cnp6YnFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MTk3NzQsImV4cCI6MjA5Mjk5NTc3NH0.Tn24dRo-fwvlKWO_7Qd_YzEq4VDtP1efEZrrapFtgjY";
const TEST_WABA_ID = "999888777666555";
const TEST_PHONE_NUMBER_ID = "111222333444555";
const SHOP_ID = "cf17c582-16ba-4b16-941c-3a9a67dd0917";
const OWNER_ID = "6a21f0d0-bfd0-4307-9215-2cfefde8672d";

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

async function main() {
  const serviceRole = loadServiceRoleKey();
  const admin = createClient(PROJECT_URL, serviceRole);

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

  await admin.from("barbershops").update({
    waba_connect_status: "not_connected",
    waba_id: null,
    waba_phone_number_id: null,
    waba_connected_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", SHOP_ID);

  const jwt = sessionData.session.access_token;
  const res = await fetch(`${PROJECT_URL}/functions/v1/infobip-waba-connect-start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      waba_id: TEST_WABA_ID,
      phone_number_id: TEST_PHONE_NUMBER_ID,
    }),
  });

  const body = await res.json().catch(() => ({}));
  console.log("HTTP", res.status, JSON.stringify(body));

  const { data: shop, error: shopErr } = await admin
    .from("barbershops")
    .select("waba_connect_status, waba_id, waba_phone_number_id, waba_connected_at, infobip_sender_number")
    .eq("id", SHOP_ID)
    .single();

  if (shopErr) throw shopErr;
  console.log("DB", JSON.stringify(shop));

  const ok =
    (res.status === 200 && body.success === true && body.status === "provisioning") ||
    (res.status === 502 || res.status === 422 || res.status === 409) &&
      shop.waba_connect_status === "error" ||
    res.status === 504 && shop.waba_connect_status === "not_connected";

  const provisioningOk =
    shop.waba_connect_status === "provisioning" &&
    shop.waba_id === TEST_WABA_ID &&
    shop.waba_phone_number_id === TEST_PHONE_NUMBER_ID &&
    shop.waba_connected_at === null &&
    shop.infobip_sender_number === null;

  if (res.status === 200 && provisioningOk) {
    console.log("SMOKE OK: provisioning gravado corretamente (share-waba 2xx).");
    process.exit(0);
  }

  if ((res.status === 502 || res.status === 422 || res.status === 504) && shop.waba_connect_status === "error" || shop.waba_connect_status === "not_connected") {
    console.log(
      "SMOKE PARTIAL: lock + share-waba tentado; Infobip retornou erro esperado em teste com WABA fake.",
      "status DB =",
      shop.waba_connect_status,
    );
    if (shop.waba_id === TEST_WABA_ID && shop.waba_phone_number_id === TEST_PHONE_NUMBER_ID && shop.waba_connect_status === "error") {
      console.log("SMOKE OK: IDs gravados antes do revert para error (fluxo 4xx Infobip).");
      process.exit(0);
    }
  }

  console.error("SMOKE FAIL", { ok, provisioningOk });
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
