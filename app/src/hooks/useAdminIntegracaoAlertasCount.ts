import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Alertas globais de integração (barbearia_id NULL) — badge no menu Admin. */
export function useAdminIntegracaoAlertasCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const { data, error } = await supabase.rpc("admin_alertas_integracao_count");
      if (error) throw error;
      setCount(typeof data === "number" ? data : 0);
    } catch {
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refresh]);

  return count;
}
