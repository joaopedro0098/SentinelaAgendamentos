/**
 * Regressao pos-deploy Twilio webhook (Node.js - evita problemas de encoding PowerShell).
 * Auto-carrega SUPABASE_SERVICE_ROLE_KEY via `supabase projects api-keys`.
 * TWILIO_AUTH_TOKEN: env var ou argumento --twilio-token=...
 *
 * Uso (na pasta app/):
 *   node supabase/scripts/regression-twilio-webhook.mjs
 *   node supabase/scripts/regression-twilio-webhook.mjs --twilio-token=xxx
 */
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRef = "zdmecbyyfubpmwrzzbqf";
const defaultWebhookUrl = `https://${projectRef}.supabase.co/functions/v1/twilio-whatsapp-webhook`;

function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const raw = execSync(
    `supabase projects api-keys --project-ref ${projectRef} -o json`,
    { cwd: appDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const keys = JSON.parse(raw);
  const service = keys.find((k) => k.name === "service_role")?.api_key;
  if (!service) throw new Error("service_role key nao encontrada via supabase projects api-keys");
  return service;
}

function getTwilioToken() {
  const arg = process.argv.find((a) => a.startsWith("--twilio-token="));
  if (arg) return arg.slice("--twilio-token=".length);
  if (process.env.TWILIO_AUTH_TOKEN?.trim()) return process.env.TWILIO_AUTH_TOKEN.trim();
  throw new Error("Defina TWILIO_AUTH_TOKEN ou passe --twilio-token=...");
}

function computeTwilioSignature(authToken, webhookUrl, formParams) {
  const sortedKeys = Object.keys(formParams).sort();
  let data = webhookUrl;
  for (const key of sortedKeys) {
    data += key + formParams[key];
  }
  return createHmac("sha1", authToken).update(data).digest("base64");
}

async function main() {
  const serviceKey = getServiceRoleKey();
  const twilioToken = getTwilioToken();
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL?.trim() || defaultWebhookUrl;

  const testSid = "SM_REGRESSION_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const formParams = {
    Body: "Confirmar",
    ButtonPayload: "confirmar00000000-0000-4000-8000-000000000001",
    From: "whatsapp:+5511999999999",
    MessageSid: testSid,
    To: "whatsapp:+5511888888888",
  };

  const signature = computeTwilioSignature(twilioToken, webhookUrl, formParams);
  const formBody = new URLSearchParams(formParams).toString();

  console.log(`POST ${webhookUrl} (MessageSid=${testSid})`);

  const webhookResp = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature,
    },
    body: formBody,
  });

  const webhookText = await webhookResp.text();
  console.log(`Webhook status: ${webhookResp.status}`);
  if (webhookResp.status !== 200) {
    throw new Error(`Webhook retornou ${webhookResp.status}: ${webhookText.slice(0, 200)}`);
  }
  if (!webhookText.includes("<Response")) {
    throw new Error("Resposta nao e TwiML vazio");
  }

  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  const jobUrl =
    `https://${projectRef}.supabase.co/rest/v1/whatsapp_webhook_jobs` +
    `?inbound_message_id=eq.${encodeURIComponent(testSid)}` +
    `&provider=eq.twilio` +
    `&select=id,provider,inbound_message_id,telefone,body,button_payload,status`;

  const jobsResp = await fetch(jobUrl, { headers: restHeaders });
  const jobs = await jobsResp.json();
  if (!Array.isArray(jobs) || jobs.length < 1) {
    throw new Error(`Job nao encontrado na fila (inbound_message_id=${testSid})`);
  }
  console.log(`Job enfileirado: ${jobs[0].id} provider=${jobs[0].provider}`);

  const workerUrl = `https://${projectRef}.supabase.co/functions/v1/process-whatsapp-webhook-jobs`;
  const workerResp = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const workerResult = await workerResp.json();
  console.log(
    `Worker: claimed=${workerResult.claimed} done=${workerResult.done} failed=${workerResult.failed}`,
  );

  const jobsAfterResp = await fetch(jobUrl, { headers: restHeaders });
  const jobsAfter = await jobsAfterResp.json();
  const finalStatus = jobsAfter[0]?.status;
  if (finalStatus === "done") {
    console.log("Regressao OK: webhook Twilio enfileirou e worker processou sem erro de schema.");
    process.exit(0);
  }

  console.warn(`Job status=${finalStatus} (pode ser ignorado se agendamento UUID de teste nao existir)`);
  if (workerResult.failed === 0 && workerResult.claimed >= 1) {
    console.log("Regressao OK parcial: enfileiramento e worker sem falha de schema/migration.");
    process.exit(0);
  }
  throw new Error(`Worker falhou: ${JSON.stringify(workerResult.errors ?? workerResult)}`);
}

main().catch((err) => {
  console.error("Regressao FALHOU:", err.message);
  process.exit(1);
});
