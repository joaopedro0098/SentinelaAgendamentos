import { supabase } from "@/integrations/supabase/client";
import { isInvalidApiKeyError } from "@/features/auth/lib/authErrors";

export type EmailSignupStatus = "registered" | "pending_confirmation" | "not_registered";

export type EmailSignupStatusResult =
  | { status: EmailSignupStatus }
  | { status: "api_key_error" }
  | { status: "unknown_error" };

export async function getEmailSignupStatus(email: string): Promise<EmailSignupStatusResult> {
  const normalized = email.trim();
  if (!normalized.includes("@")) return { status: "not_registered" };

  const { data, error } = await supabase.rpc("get_email_signup_status", {
    check_email: normalized,
  });

  if (error) {
    if (isInvalidApiKeyError(error)) return { status: "api_key_error" };
    return { status: "unknown_error" };
  }

  if (data === "registered" || data === "pending_confirmation" || data === "not_registered") {
    return { status: data };
  }

  return { status: "unknown_error" };
}

export function signupConfirmationRedirectUrl() {
  return `${window.location.origin}/auth/callback`;
}

export async function resendSignupConfirmation(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: {
      emailRedirectTo: signupConfirmationRedirectUrl(),
    },
  });
}
