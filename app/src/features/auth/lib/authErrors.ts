import type { AuthError } from "@supabase/supabase-js";

type SignUpData = {
  user?: { identities?: { id: string }[] } | null;
} | null;

export function isEmailAlreadyRegistered(error: AuthError | null, data: SignUpData): boolean {
  if (error) {
    const code = error.code ?? "";
    const msg = error.message.toLowerCase();
    return (
      code === "user_already_exists" ||
      msg.includes("already registered") ||
      msg.includes("already been registered") ||
      msg.includes("user already registered")
    );
  }
  const identities = data?.user?.identities;
  return Boolean(data?.user && Array.isArray(identities) && identities.length === 0);
}
