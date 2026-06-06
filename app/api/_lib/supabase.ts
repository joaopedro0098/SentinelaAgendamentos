import { createClient } from "@supabase/supabase-js";

export function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return { url, key };
}

export async function fetchBarbeariaBySlug(slug: string) {
  const config = getSupabaseConfig();
  if (!config) return { data: null, error: new Error("Supabase não configurado") };

  const supabase = createClient(config.url, config.key);
  return supabase
    .from("barbearias")
    .select("nome, logo_url")
    .eq("slug", slug)
    .eq("ativa", true)
    .maybeSingle();
}
