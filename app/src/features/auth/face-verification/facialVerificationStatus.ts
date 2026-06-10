import { supabase } from "@/integrations/supabase/client";

const FACE_OK_SESSION = "sentinela:face-ok";

function faceOkStorageKey(userId: string) {
  return `sentinela:face-ok:${userId}`;
}

export function clearFaceVerificationCache(userId?: string | null) {
  try {
    sessionStorage.removeItem(FACE_OK_SESSION);
    if (userId) localStorage.removeItem(faceOkStorageKey(userId));
  } catch {
    /* ignore */
  }
}

export function markFaceVerificationComplete(userId?: string | null) {
  try {
    sessionStorage.setItem(FACE_OK_SESSION, "1");
    if (userId) localStorage.setItem(faceOkStorageKey(userId), "1");
  } catch {
    /* ignore */
  }
}

/** Evita RPC repetido no login (inclui PWA reaberto). */
export function canSkipFaceVerification(userId?: string | null): boolean {
  try {
    if (sessionStorage.getItem(FACE_OK_SESSION) === "1") return true;
    if (userId && localStorage.getItem(faceOkStorageKey(userId)) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export async function userNeedsFaceVerification(userId?: string | null): Promise<boolean> {
  if (canSkipFaceVerification(userId)) return false;

  const { data, error } = await supabase.rpc("user_needs_face_verification");
  if (error) return false;

  const needs = data === true;
  if (!needs) {
    markFaceVerificationComplete(userId);
  }
  return needs;
}
