/**
 * Regressao pos-deploy quando TWILIO_AUTH_TOKEN nao esta disponivel localmente.
 * Valida: (1) webhook Twilio responde 403 sem assinatura, (2) insert na fila com schema novo,
 * (3) worker processa sem erro de migration.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRef = "zdmecbyyfubpmwrzzbqf";
const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/twilio-whatsapp-webhook`;
const workerUrl = `https://${projectRef}.supabase.co/functions/v1/process-whatsapp-webhook-jobs`;

function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const raw = execSync(
    `supabase projects api-keys --project-ref ${projectRef} -o json`,
    { cwd: appDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const service = JSON.parse(raw).find((k) => k.name === "service_role")?.api_key;
  if (!service) throw new Error("service_role nao encontrada");
  return service;
}

async function main() {
  const serviceKey = getServiceRoleKey();
  const restHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // 1) Webhook vivo + rejeita sem assinatura
  const badSigResp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "MessageSid=SM_TEST&From=whatsapp%3A%2B5511999999999&Body=test",
  });
  console.log(`Webhook sem assinatura: HTTP ${badSigResp.status} (esperado 403)`);
  if (badSigResp.status !== 403) {
    throw new Error(`Esperado 403 sem assinatura, recebeu ${badSigResp.status}`);
  }

  // 2) Insert direto na fila (mesmo schema que o webhook usa pos-migration)
  const testSid = "SM_REGRESSION_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const insertResp = await fetch(`https://${projectRef}.supabase.co/rest/v1/whatsapp_webhook_jobs`, {
    method: "POST",
    headers: restHeaders,
    body: JSON.stringify({
      inbound_message_id: testSid,
      provider: "twilio",
      telefone: "5511999999999",
      body: "Confirmar",
      button_payload: "confirmar00000000-0000-4000-8000-000000000001",
      status: "pending",
    }),
  });
  if (!insertResp.ok) {
    const err = await insertResp.text();
    throw new Error(`Insert fila falhou ${insertResp.status}: ${err}`);
  }
  const inserted = await insertResp.json();
  console.log(`Job inserido na fila: ${inserted[0]?.id ?? inserted.id} provider=twilio`);

  // 3) Worker
  const workerResp = await fetch(workerUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const workerResult = await workerResp.json();
  console.log(
    `Worker: claimed=${workerResult.claimed} done=${workerResult.done} failed=${workerResult.failed}`,
  );
  if (workerResult.failed > 0) {
    throw new Error(`Worker falhou: ${JSON.stringify(workerResult.errors ?? workerResult)}`);
  }

  // 4) Job finalizado (done ou ignorado sem erro de schema)
  const jobUrl =
    `https://${projectRef}.supabase.co/rest/v1/whatsapp_webhook_jobs` +
    `?inbound_message_id=eq.${encodeURIComponent(testSid)}&provider=eq.twilio&select=status,last_error`;
  const jobResp = await fetch(jobUrl, { headers: restHeaders });
  const jobs = await jobResp.json();
  console.log(`Job final status=${jobs[0]?.status} last_error=${jobs[0]?.last_error ?? "null"}`);
  if (jobs[0]?.status !== "done") {
    throw new Error(`Job nao concluiu (status=${jobs[0]?.status})`);
  }

  console.log("Regressao OK: schema novo + fila + worker Twilio funcionando pos-migration.");
}

main().catch((e) => {
  console.error("Regressao FALHOU:", e.message);
  process.exit(1);
});
