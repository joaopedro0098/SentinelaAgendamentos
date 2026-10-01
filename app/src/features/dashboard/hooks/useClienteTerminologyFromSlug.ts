import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getClienteTerminology,
  type ClienteTerminology,
} from "@/lib/clienteTerminology";
import {
  isBeautyProfessionalSpecialty,
  isProfessionalSpecialty,
} from "@/lib/professionalSpecialty";

const DEFAULT_TERMINOLOGY = getClienteTerminology(false);

export function useClienteTerminologyFromSlug(slug: string | null | undefined): ClienteTerminology {
  const [terminology, setTerminology] = useState<ClienteTerminology>(DEFAULT_TERMINOLOGY);

  useEffect(() => {
    const trimmed = slug?.trim();
    if (!trimmed) {
      setTerminology(DEFAULT_TERMINOLOGY);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data } = await supabase
        .from("barbershops")
        .select("professional_specialty")
        .eq("slug", trimmed)
        .maybeSingle();

      if (cancelled) return;

      const raw = data?.professional_specialty;
      const isBeauty =
        typeof raw === "string" &&
        isProfessionalSpecialty(raw) &&
        isBeautyProfessionalSpecialty(raw);

      setTerminology(getClienteTerminology(isBeauty));
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return terminology;
}
