import { supabase } from "@/integrations/supabase/client";

export const SIGNUP_OTP_LENGTH = 6;

export async function verifySignupEmailOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: "signup",
  });
}

export async function resendSignupEmailOtp(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email: email.trim(),
  });
}
