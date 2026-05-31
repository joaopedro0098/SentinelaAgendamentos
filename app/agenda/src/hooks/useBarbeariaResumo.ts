import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type BarbeariaResumo = {
  nome: string;
  logo_url: string | null;
};

export function useBarbeariaResumo(slug: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [barbearia, setBarbearia] = useState<BarbeariaResumo | null>(null);

  useEffect(() => {
    if (!slug) {
      setBarbearia(null);
      setLoading(false);
      return;
    }

    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("barbearias")
        .select("nome, logo_url")
        .eq("slug", slug)
        .maybeSingle();
      if (!active) return;
      setBarbearia(data);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  return { loading, barbearia };
}
