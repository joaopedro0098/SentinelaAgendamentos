/**
 * Smoke manual: fallback WABA Meta CT↔CA no lembrete D-1.
 *
 * Pré-requisitos:
 * 1. Deploy recente das Edge Functions (process-appointment-reminders + _shared).
 * 2. Variáveis de ambiente:
 *    - SUPABASE_SERVICE_ROLE_KEY (JWT service_role)
 *    - REMINDER_CRON_SECRET (ou x-cron-secret usado no cron)
 *
 * Uso (PowerShell):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 *   $env:REMINDER_CRON_SECRET = "..."
 *   node app/supabase/scripts/smoke-meta-ca-ct-fallback-d1.mjs ca-to-ct
 *   node app/supabase/scripts/smoke-meta-ca-ct-fallback-d1.mjs ct-to-ca
 *   node app/supabase/scripts/smoke-meta-ca-ct-fallback-d1.mjs verify --agendamento=<uuid>
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROJECT_REF = "zdmecbyyfubpmwrzzbqf";
const CRON_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/process-appointment-reminders`;

const IDS = {
  caBarbearia: "d4c60f02-162e-4417-9a13-739ba6439f00",
  ctBarbearia: "8e2168ac-040c-40e7-b107-9f55c3d865d6",
  caBarbeiro: "67a4c659-9d49-4ce0-80e3-3ef3d8f7fd00",
  ctBarbeiro: "eea6eec8-aa44-432b-ad88-464521de4c79",
  titularUser: "b31a6a89-55a8-431b-b0c4-764071270390",
  ctShop: "78d6e7e3-b8a9-45f3-b421-9e567bf24458",
  caShop: "6b025d68-5fa1-408c-96a0-1a3405359ff9",
  ctPhoneNumberId: "1314266665101348",
  testPhone: "5511949130579",
};

function tomorrowSpYmd() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1, 12, 0, 0);
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function dbQuery(sql) {
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", sql],
    { cwd: appDir, encoding: "utf8", shell: true },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error("supabase db query falhou");
  }
  const raw = r.stdout;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Resposta SQL inesperada");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return parsed.rows ?? [];
}

async function invokeCron() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const cronSecret = process.env.REMINDER_CRON_SECRET?.trim();
  if (!serviceKey || !cronSecret) {
    throw new Error("Defina SUPABASE_SERVICE_ROLE_KEY e REMINDER_CRON_SECRET");
  }
  const res = await fetch(CRON_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "x-cron-secret": cronSecret,
    },
    body: "{}",
  });
  const text = await res.text();
  console.log("Cron HTTP", res.status, text);
}

function insertAppointment({ barbeariaId, barbeiroId, tag }) {
  const data = tomorrowSpYmd();
  const sql = `
INSERT INTO agendamentos (
  barbearia_id, barbeiro_id, cliente_nome, cliente_whatsapp, data, hora,
  status, requires_client_confirmation, titular_user_id, origem, servicos_nomes, observacao
) VALUES (
  '${barbeariaId}', '${barbeiroId}', 'Smoke ${tag}', '${IDS.testPhone}', '${data}', '11:30:00',
  'confirmado', true, '${IDS.titularUser}', 'painel', ARRAY['Consulta teste']::text[],
  'smoke-meta-ca-ct-fallback ${tag}'
)
RETURNING id, barbearia_id, data, hora;
`;
  const rows = dbQuery(sql);
  console.log("Agendamento criado:", rows[0]);
  return rows[0]?.id;
}

function verifyAgendamento(agendamentoId) {
  const rows = dbQuery(`
SELECT a.id, a.barbearia_id, bb.slug AS barbearia_slug,
       w.id AS msg_id, w.external_message_id, w.provider, w.tipo, w.status, w.telefone,
       w.meta_send_message_status, w.meta_delivery_status
FROM agendamentos a
LEFT JOIN barbearias bb ON bb.id = a.barbearia_id
LEFT JOIN whatsapp_mensagens_enviadas w ON w.agendamento_id = a.id AND w.tipo = 'lembrete_d1'
WHERE a.id = '${agendamentoId}'
ORDER BY w.enviado_em DESC NULLS LAST
LIMIT 1;
`);
  console.log(JSON.stringify(rows[0], null, 2));
  const ctPhone = IDS.ctPhoneNumberId;
  console.log(
    "\nEsperado: barbearia_id da CA/CT do agendamento; external_message_id wamid.* se Meta aceitou;",
  );
  console.log(`phone_number_id da CT em produção: ${ctPhone} (confira nos logs da Edge após deploy com log).`);
}

function setupCtToCaBorrow() {
  console.log("Configurando CT sem WABA sendable + emprestimo CA (copia credenciais Meta da CT → CA)...");
  dbQuery(`
UPDATE barbershops SET
  whatsapp_messaging_provider = 'twilio',
  waba_connect_status = 'not_connected'
WHERE id = '${IDS.ctShop}';
`);
  dbQuery(`
UPDATE barbershops ca SET
  whatsapp_messaging_provider = 'meta',
  waba_connect_status = 'connected',
  waba_phone_number_id = ct.waba_phone_number_id,
  waba_id = ct.waba_id,
  waba_access_token_encrypted = ct.waba_access_token_encrypted
FROM barbershops ct
WHERE ca.id = '${IDS.caShop}' AND ct.id = '${IDS.ctShop}';
`);
  dbQuery(`
INSERT INTO whatsapp_waba_message_templates (
  barbershop_id, meta_template_name, language, sentinela_category,
  body_display_text, meta_status, is_selected
)
SELECT '${IDS.caShop}', meta_template_name, language, sentinela_category,
       body_display_text, meta_status, true
FROM whatsapp_waba_message_templates
WHERE barbershop_id = '${IDS.ctShop}' AND sentinela_category = 'confirmacao' AND is_selected = true
ON CONFLICT DO NOTHING;
`);
}

function restoreCtToCaBorrow() {
  console.log("Restaurando shops pós smoke CT→CA...");
  dbQuery(`
UPDATE barbershops SET
  whatsapp_messaging_provider = 'meta',
  waba_connect_status = 'connected'
WHERE id = '${IDS.ctShop}';
`);
  dbQuery(`
UPDATE barbershops SET
  whatsapp_messaging_provider = 'twilio',
  waba_connect_status = 'not_connected',
  waba_phone_number_id = NULL,
  waba_id = NULL,
  waba_access_token_encrypted = NULL
WHERE id = '${IDS.caShop}';
`);
  dbQuery(`
DELETE FROM whatsapp_waba_message_templates
WHERE barbershop_id = '${IDS.caShop}';
`);
}

const mode = process.argv[2] ?? "help";

if (mode === "ca-to-ct") {
  const id = insertAppointment({
    barbeariaId: IDS.caBarbearia,
    barbeiroId: IDS.caBarbeiro,
    tag: "CA→CT",
  });
  console.log("Disparando cron D-1...");
  await invokeCron();
  console.log("Verificando...");
  verifyAgendamento(id);
} else if (mode === "ct-to-ca-setup") {
  setupCtToCaBorrow();
} else if (mode === "ct-to-ca") {
  const id = insertAppointment({
    barbeariaId: IDS.ctBarbearia,
    barbeiroId: IDS.ctBarbeiro,
    tag: "CT→CA",
  });
  console.log("Disparando cron D-1...");
  await invokeCron();
  verifyAgendamento(id);
  restoreCtToCaBorrow();
} else if (mode === "verify") {
  const arg = process.argv.find((a) => a.startsWith("--agendamento="));
  if (!arg) throw new Error("Use --agendamento=<uuid>");
  verifyAgendamento(arg.split("=")[1]);
} else {
  console.log(`Modos: ca-to-ct | ct-to-ca-setup | ct-to-ca | verify --agendamento=<uuid>`);
}
