import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClienteTerminologyFromSlug } from "@/features/dashboard/hooks/useClienteTerminologyFromSlug";

/** Resolve terminologia pelo slug da barbearia associada ao token de ativação. */
export function useClienteTerminologyFromActivationToken(token: string | null | undefined) {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = token?.trim();
    if (!trimmed) {
      setSlug(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data } = await supabase.rpc("verify_patient_activation_token", { p_token: trimmed });
      if (cancelled) return;
      const row = data as { barbearia_slug?: string | null } | null;
      setSlug(row?.barbearia_slug?.trim() || null);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return useClienteTerminologyFromSlug(slug);
}
