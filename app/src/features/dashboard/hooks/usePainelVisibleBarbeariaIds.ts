import { useEffect, useState } from "react";
import { supabase } from "@agenda/integrations/supabase/client";
import { useDashboardShop } from "@/providers/DashboardShopProvider";

/** IDs de barbearias visíveis no painel (titular + CAs), alinhado ao backend. */
export function usePainelVisibleBarbeariaIds(fallbackIds: string[]) {
  const { permissionsRevision } = useDashboardShop();
  const fallbackKey = fallbackIds.join("|");
  const [ids, setIds] = useState(fallbackIds);

  useEffect(() => {
    setIds(fallbackIds);
  }, [fallbackKey, fallbackIds]);

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("painel_barbearia_ids_visiveis").then(({ data, error }) => {
      if (cancelled || error || !Array.isArray(data)) return;
      setIds((data as string[]).filter(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, [fallbackKey, permissionsRevision]);

  return ids;
}
