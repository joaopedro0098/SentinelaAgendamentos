import type { User } from "@supabase/supabase-js";

/** E-mail confirmado (Google OAuth já vem confirmado). */
export function isEmailVerified(user: User | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at);
}
