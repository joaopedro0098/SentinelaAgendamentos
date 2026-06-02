import { supabase } from "@/integrations/supabase/client";

const FACE_OK_KEY = "sentinela:face-ok";

export function clearFaceVerificationCache() {
  try {
    sessionStorage.removeItem(FACE_OK_KEY);
  } catch {
    /* ignore */
  }
}

export async function userNeedsFaceVerification(): Promise<boolean> {
  try {
    if (sessionStorage.getItem(FACE_OK_KEY) === "1") return false;
  } catch {
    /* ignore */
  }

  const { data, error } = await supabase.rpc("user_needs_face_verification");
  if (error) return false;

  const needs = data === true;
  if (!needs) {
    try {
      sessionStorage.setItem(FACE_OK_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  return needs;
}
