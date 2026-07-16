import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Contagem de jobs WhatsApp failed nas últimas 24h — só para badge no menu admin (desktop). */
export function useAdminFailedWebhookJobsCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const { data, error } = await supabase.rpc("admin_whatsapp_webhook_jobs_failed_count_24h");
        if (cancelled || error) return;
        setCount(typeof data === "number" ? data : 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return count;
}
