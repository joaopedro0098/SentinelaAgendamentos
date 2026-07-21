import { supabase } from "@/integrations/supabase/client";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";
import { FACIAL_HANDOFF_TTL_MS } from "@/features/auth/face-verification/facialHandoffConstants";

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
  const row = data as { ok?: boolean; error?: FacialHandoffClaimError };
  if (row?.ok) return { ok: true };
  return { ok: false, error: row?.error ?? "not_found" };
}

type ConsumeRow = {
  ready?: boolean;
  status?: string;
  error?: string;
  result?: {
    embedding?: number[];
    trial_eligible?: boolean;
    facial_match?: boolean;
  };
};

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

  const row = data as ConsumeRow;
  if (!row?.ready) return { ready: false };

  if (row.status === "failed") {
    return { ready: true, status: "failed", error: row.error ?? "failed" };
  }

  const embedding = row.result?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 128) {
    throw new Error("Resposta de verificação inválida.");
  }

  return {
    ready: true,
    status: "completed",
    result: {
      embedding,
      trialEligible: row.result?.trial_eligible === true,
      facialMatch: row.result?.facial_match === true,
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
