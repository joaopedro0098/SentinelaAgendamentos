/**
 * Worker: consome a fila whatsapp_webhook_jobs e executa a lógica de negócio.
 * Invocado por pg_cron a cada 1 minuto (invoke_process_whatsapp_webhook_jobs_cron).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  claimPendingWebhookJobs,
  markWebhookJobDone,
  markWebhookJobFailed,
} from "../_shared/whatsappWebhookQueue.ts";
import { processWhatsAppInboundReply } from "../_shared/processWhatsAppInboundReply.ts";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jobs = await claimPendingWebhookJobs(supabase);
    let done = 0;
    let failed = 0;
    const errors: Array<{ job_id: string; error: string }> = [];

    for (const job of jobs) {
      const result = await processWhatsAppInboundReply(supabase, {
        telefone: job.telefone,
        body: job.body,
      });

      if (result.ok) {
        await markWebhookJobDone(supabase, job.id);
        done += 1;
      } else if (result.retryable !== false) {
        await markWebhookJobFailed(supabase, job, result.error);
        failed += 1;
        errors.push({ job_id: job.id, error: result.error });
      } else {
        await markWebhookJobFailed(supabase, { ...job, attempts: job.max_attempts }, result.error);
        failed += 1;
        errors.push({ job_id: job.id, error: result.error });
      }
    }

    return jsonResponse({
      ok: true,
      claimed: jobs.length,
      done,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("process-whatsapp-webhook-jobs:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Falha ao processar fila de webhooks WhatsApp.",
    }, 500);
  }
});
