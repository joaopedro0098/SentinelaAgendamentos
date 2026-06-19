import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

function authParamsFromUrl() {
  const url = new URL(window.location.href);
  return {
    code: url.searchParams.get("code"),
    hasParams: url.searchParams.has("code") || url.hash.includes("access_token="),
  };
}

function clearAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.hash = "";
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

/** OAuth (Google): troca o code da URL por sessão. */
export async function consumeAuthCallbackUrl(): Promise<boolean> {
  const { code } = authParamsFromUrl();
  if (!code) return false;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return false;

  clearAuthParamsFromUrl();
  return true;
}

export function urlHasPendingAuthCallback(): boolean {
  return authParamsFromUrl().hasParams;
}

export function waitForAuthSession(timeoutMs = 12_000): Promise<Session | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
      resolve(session);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        finish(session);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(data.session);
    });

    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => finish(data.session));
    }, timeoutMs);
  });
}
