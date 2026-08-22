/**
 * Busca invocações recentes da infobip-whatsapp-webhook via Management API.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRef = "zdmecbyyfubpmwrzzbqf";
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function getAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    const raw = execSync("supabase projects list -o json", {
      cwd: appDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

async function fetchLogsViaAnalytics(token) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all`;
  const sql = `
    select id, timestamp, event_message, metadata
    from function_logs
    where event_message like '%infobip-whatsapp-webhook%'
       or event_message like '%infobip webhook%'
    order by timestamp desc
    limit 30
  `.trim();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  const text = await res.text();
  return { status: res.status, body: text };
}

async function fetchEdgeInvocations(token) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all`;
  const sql = `
    select timestamp, event_message, metadata
    from function_edge_logs
    where metadata.request.pathname like '%infobip-whatsapp-webhook%'
    order by timestamp desc
    limit 20
  `.trim();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  const token = getAccessToken();
  if (!token) {
    console.log("NO_ACCESS_TOKEN: use Dashboard ou export SUPABASE_ACCESS_TOKEN");
    process.exit(0);
  }

  const invocations = await fetchEdgeInvocations(token);
  console.log("=== function_edge_logs ===");
  console.log("HTTP", invocations.status);
  console.log(invocations.body.slice(0, 8000));

  const logs = await fetchLogsViaAnalytics(token);
  console.log("\n=== function_logs ===");
  console.log("HTTP", logs.status);
  console.log(logs.body.slice(0, 8000));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
