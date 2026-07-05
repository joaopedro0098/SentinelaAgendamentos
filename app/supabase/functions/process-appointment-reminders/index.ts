import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { configureWebPush } from "../_shared/webPush.ts";
import { sendDueClientConfirmationPushes } from "../_shared/clientConfirmationPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

function isCronAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();
  const requestSecret =
    req.headers.get("x-cron-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (!cronSecret) return true;
  if (requestSecret === cronSecret) return true;
  if (isServiceRoleToken(requestSecret)) return true;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (serviceKey && requestSecret === serviceKey) return true;

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!isCronAuthorized(req)) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.clone().json();
        force = Boolean(body?.force);
      } catch {
        force = false;
      }
    }

    configureWebPush();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const pushResult = await sendDueClientConfirmationPushes(supabase, { force });
    const { data: canceledCount } = await supabase.rpc("cancel_unconfirmed_appointments");

    return jsonResponse({
      ok: true,
      confirmation_pushes: pushResult,
      canceled: canceledCount ?? 0,
    });
  } catch (error) {
    console.error("process-appointment-reminders:", error);
    return jsonResponse({ error: "Não foi possível processar manutenção de agendamentos." }, 500);
  }
});
