import { supabase } from "@/integrations/supabase/client";
import { isInvalidApiKeyError } from "@/features/auth/lib/authErrors";

export type EmailCheckResult =
  | { status: "registered" }
  | { status: "not_registered" }
  | { status: "api_key_error" }
  | { status: "unknown_error" };

/** Verifica se o e-mail já tem conta. */
export async function checkEmailRegistered(email: string): Promise<EmailCheckResult> {
  const normalized = email.trim();
  if (!normalized.includes("@")) return { status: "not_registered" };

  const { data, error } = await supabase.rpc("is_email_registered", {
    check_email: normalized,
  });

  if (error) {
    if (isInvalidApiKeyError(error)) return { status: "api_key_error" };
    return { status: "unknown_error" };
  }

  if (data === true) return { status: "registered" };
  if (data === false) return { status: "not_registered" };
  return { status: "unknown_error" };
}
