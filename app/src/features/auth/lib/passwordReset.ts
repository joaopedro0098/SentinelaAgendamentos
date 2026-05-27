import { supabase } from "@/integrations/supabase/client";

export function passwordResetRedirectUrl() {
  return `${window.location.origin}/reset-password`;
}

export async function bootstrapPasswordRecoverySession(): Promise<"ready" | "invalid" | "pending"> {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

  const errorDescription = url.searchParams.get("error_description") ?? hashParams.get("error_description");
  if (errorDescription) return "invalid";

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return "invalid";
    window.history.replaceState({}, document.title, url.pathname);
    return "ready";
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) return "ready";

  return "pending";
}
