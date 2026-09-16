/**
 * Smoke manual: inscrição do app Meta em webhooks no nível do app (Graph API).
 *
 * POST /{APP_ID}/subscriptions — objeto whatsapp_business_account + callback + fields.
 * GET  /{APP_ID}/subscriptions — confirma campos inscritos.
 *
 * Uso (PowerShell, na pasta app/):
 *   $env:META_APP_SECRET="<app secret>"
 *   $env:META_WEBHOOK_VERIFY_TOKEN="<mesmo valor da edge waba-account-webhook>"
 *   $env:META_WEBHOOK_CALLBACK_URL="https://<project>.supabase.co/functions/v1/waba-account-webhook"
 *   node supabase/scripts/smoke-meta-app-webhook-subscriptions.mjs
 *
 * Opcional:
 *   META_APP_ID (default 2136245233992856)
 *   META_GRAPH_API_VERSION (default v21.0)
 *   SUPABASE_URL — se META_WEBHOOK_CALLBACK_URL omitido, deriva .../functions/v1/waba-account-webhook
 *   META_APP_SUBSCRIBE_DRY_RUN=1 — só GET, sem POST
 */
const META_APP_ID = process.env.META_APP_ID?.trim() ?? "2136245233992856";
const META_APP_SECRET = process.env.META_APP_SECRET?.trim();
const API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() ?? "v21.0";
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
const DRY_RUN = process.env.META_APP_SUBSCRIBE_DRY_RUN === "1";

const WEBHOOK_OBJECT = "whatsapp_business_account";

/** Mínimo pedido + campos já usados em WABA subscribed_apps (coexistência). */
const SUBSCRIPTION_FIELDS = [
  "messages",
  "message_template_status_update",
  "account_update",
  "history",
  "smb_app_state_sync",
  "smb_message_echoes",
];

const REQUIRED_FIELD_CHECKS = ["messages", "message_template_status_update", "account_update"];

function resolveCallbackUrl() {
  const explicit = process.env.META_WEBHOOK_CALLBACK_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.SUPABASE_URL?.trim()?.replace(/\/$/, "");
  if (base) return `${base}/functions/v1/waba-account-webhook`;
  return null;
}

function appAccessToken() {
  return `${META_APP_ID}|${META_APP_SECRET}`;
}

function graphUrl(path, searchParams = {}) {
  const url = new URL(`https://graph.facebook.com/${API_VERSION}/${path}`);
  for (const [k, v] of Object.entries(searchParams)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  return url;
}

async function getAppSubscriptions() {
  const url = graphUrl(`${META_APP_ID}/subscriptions`, { access_token: appAccessToken() });
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function postAppSubscription({ callbackUrl, verifyToken }) {
  const url = graphUrl(`${META_APP_ID}/subscriptions`);
  const form = new URLSearchParams({
    access_token: appAccessToken(),
    object: WEBHOOK_OBJECT,
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: SUBSCRIPTION_FIELDS.join(","),
  });

  const res = await fetch(url, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function normalizeFieldList(entry) {
  const raw = entry?.fields;
  if (Array.isArray(raw)) return raw.map((f) => String(f).trim()).filter(Boolean);
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function findWhatsappSubscription(data) {
  if (!Array.isArray(data)) return null;
  return (
    data.find((e) => String(e?.object ?? "").toLowerCase() === WEBHOOK_OBJECT) ??
    data.find((e) => String(e?.object ?? "").includes("whatsapp")) ??
    null
  );
}

function assertRequiredFieldsPresent(fields) {
  const set = new Set(fields.map((f) => f.toLowerCase()));
  const missing = REQUIRED_FIELD_CHECKS.filter((f) => !set.has(f));
  return missing;
}

async function main() {
  if (!META_APP_SECRET) {
    console.error("Defina META_APP_SECRET (não commitar).");
    process.exit(1);
  }

  const callbackUrl = resolveCallbackUrl();
  if (!DRY_RUN && !callbackUrl) {
    console.error(
      "Defina META_WEBHOOK_CALLBACK_URL ou SUPABASE_URL para montar o callback do waba-account-webhook.",
    );
    process.exit(1);
  }
  if (!DRY_RUN && !VERIFY_TOKEN) {
    console.error("Defina META_WEBHOOK_VERIFY_TOKEN (mesmo valor configurado na edge function).");
    process.exit(1);
  }

  console.log("App ID:", META_APP_ID);
  console.log("Graph API:", API_VERSION);
  console.log("Object:", WEBHOOK_OBJECT);
  console.log("Fields (POST):", SUBSCRIPTION_FIELDS.join(", "));
  if (callbackUrl) console.log("Callback URL:", callbackUrl);
  if (DRY_RUN) console.log("DRY RUN: apenas GET subscriptions");

  const before = await getAppSubscriptions();
  console.log("\nGET subscriptions ANTES:", before.status, JSON.stringify(before.body, null, 2));
  if (!before.ok) {
    console.error("FAIL: GET subscriptions antes do POST falhou.");
    process.exit(1);
  }

  if (!DRY_RUN) {
    const posted = await postAppSubscription({ callbackUrl, verifyToken: VERIFY_TOKEN });
    console.log("\nPOST subscriptions:", posted.status, JSON.stringify(posted.body, null, 2));
    if (!posted.ok) {
      console.error("FAIL: POST subscriptions falhou.");
      process.exit(1);
    }
  }

  const after = await getAppSubscriptions();
  console.log("\nGET subscriptions DEPOIS:", after.status, JSON.stringify(after.body, null, 2));
  if (!after.ok) {
    console.error("FAIL: GET subscriptions depois do POST falhou.");
    process.exit(1);
  }

  const entry = findWhatsappSubscription(after.body?.data);
  if (!entry) {
    console.error(
      `FAIL: nenhuma inscrição para object=${WEBHOOK_OBJECT} em data[].`,
      "Resposta:",
      JSON.stringify(after.body?.data ?? []),
    );
    process.exit(1);
  }

  const fields = normalizeFieldList(entry);
  const missing = assertRequiredFieldsPresent(fields);
  if (missing.length > 0) {
    console.error("FAIL: campos obrigatórios ausentes na inscrição:", missing.join(", "));
    console.error("Campos retornados:", fields.join(", ") || "(vazio)");
    process.exit(1);
  }

  console.log("\nOK: inscrição ativa com campos:", fields.join(", "));
  if (entry.callback_url) console.log("Callback confirmado:", entry.callback_url);
  if (entry.active === false) {
    console.warn("AVISO: subscription retornou active=false — verifique no App Dashboard.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
