import { supabase } from "@/integrations/supabase/client";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";

export type FacialHandoffSessionCreated = {
  session_id: string;
  expires_at: string;
  watch_token: string;
};

export type FacialHandoffClaimError = "expired" | "already_claimed" | "not_found";

export async function createFacialHandoffSession(): Promise<FacialHandoffSessionCreated> {
  const { data, error } = await supabase.rpc("create_facial_handoff_session");
  if (error) throw new Error(error.message);
  const row = data as FacialHandoffSessionCreated & { error?: string };
  if (!row?.session_id || !row.watch_token || !row.expires_at) {
    throw new Error("Não foi possível iniciar a sessão de verificação.");
  }
  return row;
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

export async function submitFacialHandoffComplete(sessionId: string, embedding: number[]) {
  const { data, error } = await supabase.functions.invoke("facial-handoff-complete", {
    body: { session_id: sessionId, embedding },
  });
  if (error) throw new Error(error.message);
  const row = data as { ok?: boolean; error?: string };
  if (!row?.ok) {
    throw new Error(row?.error ?? "Não foi possível concluir a verificação.");
  }
  return row;
}
