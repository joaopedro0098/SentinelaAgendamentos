import type { AuthError } from "@supabase/supabase-js";

type SignUpData = {
  user?: { identities?: { id: string }[] } | null;
} | null;

type SupabaseLikeError = {
  message?: string;
  code?: string;
  hint?: string;
} | null;

export function isInvalidApiKeyError(error: SupabaseLikeError): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toLowerCase();
  const hint = String((error as { hint?: string }).hint ?? "").toLowerCase();
  return (
    msg.includes("invalid api key") ||
    msg.includes("invalid apikey") ||
    msg.includes("no api key") ||
    msg.includes("api key") ||
    code === "pgrst301" ||
    hint.includes("api key")
  );
}

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

export const AUTH_CONFIG_ERROR_MESSAGE =
  "Não foi possível conectar ao Supabase. No EasyPanel, confira VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (chave anon public) e faça um novo deploy.";
