import { supabase } from "@/integrations/supabase/client";

const SUPABASE_FUNCTIONS_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
).trim();

async function readFunctionPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as { error?: string; message?: string; [key: string]: unknown };
  } catch {
    return { message: text };
  }
}

/** Chama Edge Functions de billing com JWT do usuário logado. */
export async function invokeBillingFunction<T>(
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Faça login novamente para continuar.");
  if (!SUPABASE_FUNCTIONS_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase não configurado no app.");
  }

  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readFunctionPayload(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "Edge Function retornou erro sem mensagem.");
  }
  return payload as T;
}

export const STRIPE_PUBLISHABLE_KEY = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
