import { supabase } from "@/integrations/supabase/client";

export type FacialVerificationResult = {
  embedding: number[];
  trialEligible: boolean;
  facialMatch: boolean;
};

export async function registerUserFacialEmbedding(
  embedding: number[],
): Promise<{ trialEligible: boolean; facialMatch: boolean }> {
  const { data, error } = await supabase.rpc("register_user_facial_embedding", {
    p_embedding: embedding,
  });

  if (error || !data || typeof data !== "object") {
    throw new Error("Não foi possível registrar a verificação facial.");
  }

  const row = data as { trial_eligible?: boolean; facial_match?: boolean };
  return {
    trialEligible: row.trial_eligible !== false,
    facialMatch: row.facial_match === true,
  };
}

export type FacialVerificationProgress = {
  stage: "camera" | "liveness" | "embedding" | "checking" | "done" | "error";
  message: string;
};

export async function checkFacialTrialEligibility(embedding: number[]): Promise<{ trialEligible: boolean; facialMatch: boolean }> {
  const { data, error } = await supabase.rpc("check_facial_trial_eligibility", {
    p_embedding: embedding,
  });

  if (error || !data || typeof data !== "object") {
    return { trialEligible: true, facialMatch: false };
  }

  const row = data as { trial_eligible?: boolean; facial_match?: boolean };
  return {
    trialEligible: row.trial_eligible !== false,
    facialMatch: row.facial_match === true,
  };
}

export async function buildEmbeddingFromSnapshot(
  canvas: HTMLCanvasElement,
  onProgress?: (p: FacialVerificationProgress) => void,
): Promise<number[]> {
  onProgress?.({ stage: "embedding", message: "Gerando verificação facial…" });
  const { computeFaceEmbedding } = await import("./faceEmbeddingService");
  return computeFaceEmbedding(canvas);
}
