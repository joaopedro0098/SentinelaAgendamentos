/**
 * Camada de enfileiramento para respostas WhatsApp recebidas via webhook.
 *
 * Implementação atual: tabela `whatsapp_webhook_jobs` no Postgres.
 * TODO(queue-migration): para trocar por Redis/SQS/RabbitMQ no futuro, substitua apenas
 * as funções deste módulo — a lógica de negócio em processWhatsAppInboundReply.ts não muda.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type EnqueueInboundReplyParams = {
  inboundMessageSid: string;
  telefone: string;
  body: string;
};

export type EnqueueInboundReplyResult =
  | { ok: true; jobId: string; duplicate: false }
  | { ok: true; duplicate: true }
  | { ok: false; error: string };

function isUniqueViolation(error: { code?: string }) {
  return error.code === "23505";
}

/**
 * Enfileira um job para processamento assíncrono.
 * `inboundMessageSid` (MessageSid RECEBIDO da Twilio) é a chave de idempotência:
 * se já existir, retorna `{ duplicate: true }` sem criar job novo.
 */
export async function enqueueInboundWhatsAppReply(
  supabase: SupabaseClient,
  params: EnqueueInboundReplyParams,
): Promise<EnqueueInboundReplyResult> {
  const sid = params.inboundMessageSid.trim();
  if (!sid) {
    return { ok: false, error: "inbound_message_sid ausente" };
  }

  const { data, error } = await supabase
    .from("whatsapp_webhook_jobs")
    .insert({
      inbound_message_sid: sid,
      telefone: params.telefone,
      body: params.body,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: true, duplicate: true };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, jobId: data.id as string, duplicate: false };
}

export type WebhookJobRow = {
  id: string;
  inbound_message_sid: string;
  telefone: string;
  body: string;
  status: string;
  attempts: number;
  max_attempts: number;
};

const DEFAULT_BATCH_LIMIT = 50;

/** Busca jobs prontos para processar (pending com tentativas restantes). */
export async function claimPendingWebhookJobs(
  supabase: SupabaseClient,
  limit = DEFAULT_BATCH_LIMIT,
): Promise<WebhookJobRow[]> {
  const { data: candidates, error: selectError } = await supabase
    .from("whatsapp_webhook_jobs")
    .select("id, inbound_message_sid, telefone, body, status, attempts, max_attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selectError) throw new Error(selectError.message);
  if (!candidates?.length) return [];

  const claimed: WebhookJobRow[] = [];

  for (const job of candidates as WebhookJobRow[]) {
    if (job.attempts >= job.max_attempts) continue;

    const { data: locked, error: lockError } = await supabase
      .from("whatsapp_webhook_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        attempts: job.attempts + 1,
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .select("id, inbound_message_sid, telefone, body, status, attempts, max_attempts")
      .maybeSingle();

    if (lockError) {
      console.error("claimPendingWebhookJobs lock:", lockError.message);
      continue;
    }
    if (locked) claimed.push(locked as WebhookJobRow);
  }

  return claimed;
}

export async function markWebhookJobDone(supabase: SupabaseClient, jobId: string) {
  await supabase
    .from("whatsapp_webhook_jobs")
    .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
    .eq("id", jobId);
}

export async function markWebhookJobFailed(
  supabase: SupabaseClient,
  job: WebhookJobRow,
  errorMessage: string,
) {
  const permanent = job.attempts >= job.max_attempts;

  await supabase
    .from("whatsapp_webhook_jobs")
    .update({
      status: permanent ? "failed" : "pending",
      last_error: errorMessage.slice(0, 2000),
      processed_at: permanent ? new Date().toISOString() : null,
      started_at: null,
    })
    .eq("id", job.id);
}
