import { supabase } from "@/integrations/supabase/client";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";
import {
  FACIAL_HANDOFF_BROADCAST_EVENT,
  FACIAL_HANDOFF_TTL_MS,
  facialHandoffChannelName,
} from "@/features/auth/face-verification/facialHandoffConstants";

export type FacialHandoffSessionCreated = {
  session_id: string;
  expires_at: string;
  watch_token: string;
};

export type FacialHandoffClaimError = "expired" | "already_claimed" | "not_found";

function unwrapRpcJson<T>(data: unknown): T {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as T;
    }
  }
  return data as T;
}

function parseHandoffReadyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeHandoffEmbedding(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== 128) return null;
  const nums = raw.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

/** Postgres/PostgREST às vezes devolve timestamptz com espaço no lugar de "T". */
export function parseFacialHandoffExpiresAt(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string" && value.trim()) {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(Date.now() + FACIAL_HANDOFF_TTL_MS);
}

export async function createFacialHandoffSession(): Promise<FacialHandoffSessionCreated> {
  const { data, error } = await supabase.rpc("create_facial_handoff_session");
  if (error) throw new Error(error.message);
  const row = unwrapRpcJson<FacialHandoffSessionCreated & { error?: string }>(data);
  const sessionId = row?.session_id != null ? String(row.session_id) : "";
  const watchToken = row?.watch_token != null ? String(row.watch_token) : "";
  const expiresAtRaw = row?.expires_at;
  if (!sessionId || !watchToken || expiresAtRaw == null || expiresAtRaw === "") {
    throw new Error("Não foi possível iniciar a sessão de verificação.");
  }
  return {
    session_id: sessionId,
    watch_token: watchToken,
    expires_at:
      typeof expiresAtRaw === "string"
        ? expiresAtRaw
        : parseFacialHandoffExpiresAt(expiresAtRaw).toISOString(),
  };
}

export async function claimFacialHandoffSession(sessionId: string): Promise<{ ok: true } | { ok: false; error: FacialHandoffClaimError }> {
  const { data, error } = await supabase.rpc("claim_facial_handoff_session", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(error.message);
  const row = unwrapRpcJson<{ ok?: boolean; error?: FacialHandoffClaimError }>(data);
  if (row?.ok) return { ok: true };
  return { ok: false, error: row?.error ?? "not_found" };
}

type ConsumeRow = {
  ready?: boolean;
  status?: string;
  error?: string;
  result?: {
    embedding?: unknown;
    trial_eligible?: boolean | string;
    facial_match?: boolean | string;
  };
};

function parseConsumeRow(data: unknown): ConsumeRow {
  const row = unwrapRpcJson<ConsumeRow & { ready?: unknown }>(data);
  return {
    ...row,
    ready: parseHandoffReadyFlag(row?.ready),
  };
}

export async function consumeFacialHandoffResult(
  sessionId: string,
  watchToken: string,
): Promise<
  | { ready: false }
  | { ready: true; status: "failed"; error: string }
  | { ready: true; status: "completed"; result: FacialVerificationResult }
> {
  const { data, error } = await supabase.rpc("consume_facial_handoff_result", {
    p_session_id: sessionId,
    p_watch_token: watchToken,
  });
  if (error) throw new Error(error.message);

  const row = parseConsumeRow(data);
  if (!row.ready) return { ready: false };

  if (row.status === "failed") {
    return { ready: true, status: "failed", error: row.error ?? "failed" };
  }

  const embedding = normalizeHandoffEmbedding(row.result?.embedding);
  if (!embedding) {
    throw new Error("Resposta de verificação inválida.");
  }

  return {
    ready: true,
    status: "completed",
    result: {
      embedding,
      trialEligible: row.result?.trial_eligible === true || row.result?.trial_eligible === "true",
      facialMatch: row.result?.facial_match === true || row.result?.facial_match === "true",
    },
  };
}

export class FacialHandoffSubmitError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "FacialHandoffSubmitError";
  }
}

export async function submitFacialHandoffComplete(sessionId: string, embedding: number[]) {
  const { data, error } = await supabase.rpc("submit_facial_handoff_verification", {
    p_session_id: sessionId,
    p_embedding: embedding,
  });

  if (error) {
    throw new FacialHandoffSubmitError("network", error.message);
  }

  const row = unwrapRpcJson<{ ok?: boolean; error?: string }>(data);
  if (!row?.ok) {
    throw new FacialHandoffSubmitError(row?.error ?? "unknown");
  }
  return row;
}

/** Acorda o desktop (Realtime broadcast). Falha silenciosa — o polling no PC cobre o resto. */
export async function notifyFacialHandoffDesktop(sessionId: string): Promise<void> {
  const channel = supabase.channel(facialHandoffChannelName(sessionId), {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    const done = () => {
      void supabase.removeChannel(channel);
      resolve();
    };
    const timer = window.setTimeout(done, 4000);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel
          .send({
            type: "broadcast",
            event: FACIAL_HANDOFF_BROADCAST_EVENT,
            payload: { session_id: sessionId, status: "completed" },
          })
          .finally(() => {
            window.clearTimeout(timer);
            done();
          });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(timer);
        done();
      }
    });
  });
}
