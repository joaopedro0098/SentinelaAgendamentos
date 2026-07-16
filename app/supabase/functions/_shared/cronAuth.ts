/**
 * Autorização interna para Edge Functions invocadas pelo pg_cron (verify_jwt = false).
 * Exige REMINDER_CRON_SECRET, service role JWT ou SUPABASE_SERVICE_ROLE_KEY — nunca aceita anônimo.
 */

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isServiceRoleToken(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.role !== "service_role") return false;
  const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  return !projectRef || payload.ref === projectRef;
}

export function isCronAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();
  const requestSecret =
    req.headers.get("x-cron-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (!requestSecret) return false;

  if (cronSecret && requestSecret === cronSecret) return true;
  if (isServiceRoleToken(requestSecret)) return true;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (serviceKey && requestSecret === serviceKey) return true;

  return false;
}
