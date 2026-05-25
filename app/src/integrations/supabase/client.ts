import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function readEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = readEnv(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_PUBLISHABLE_KEY = readEnv(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL?.trim() && SUPABASE_PUBLISHABLE_KEY?.trim(),
);

function createSupabaseClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no build (EasyPanel → Ambiente).",
    );
  }
  return createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let client: SupabaseClient<Database> | null = null;

/** Cliente lazy — evita quebrar a landing se o .env não existir no build. */
export function getSupabase(): SupabaseClient<Database> {
  if (!client) client = createSupabaseClient();
  return client;
}

/** @deprecated Prefira getSupabase() — mantido para imports existentes. */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const real = getSupabase() as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
