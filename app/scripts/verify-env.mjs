/**
 * Falha o build de produção se as variáveis Vite do Supabase não existirem.
 * Elas precisam estar disponíveis antes do `npm run build`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const url = (process.env.VITE_SUPABASE_URL ?? "").trim();
const key = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  ""
).trim();

const problems = [];
if (!url) problems.push("VITE_SUPABASE_URL");
if (!key) problems.push("VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY)");
if (url.includes("/rest/v1")) {
  problems.push("VITE_SUPABASE_URL não deve terminar com /rest/v1");
}
if (key && !key.startsWith("eyJ")) {
  problems.push("a chave anon public costuma começar com eyJ (confira se não colou a service_role)");
}

if (problems.length) {
  console.error("\n[build] Variáveis do Supabase ausentes ou inválidas:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nDefina as variáveis no ambiente de build (.env local ou painel do hosting) e rode npm run build de novo.\n",
  );
  process.exit(1);
}

console.log("[build] Supabase OK:", url.replace(/^https?:\/\//, "").split(".")[0] + "…");
