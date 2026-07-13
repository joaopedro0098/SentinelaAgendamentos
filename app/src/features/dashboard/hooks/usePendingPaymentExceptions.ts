import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const MP_PAYMENT_EXCEPTIONS_CHANGED = "mp-payment-exceptions-changed";

export function notifyPaymentExceptionsChanged() {
  window.dispatchEvent(new CustomEvent(MP_PAYMENT_EXCEPTIONS_CHANGED));
}

export function usePendingPaymentExceptions(enabled = true) {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setPendingCount(0);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("list_mp_payment_exceptions", { p_limit: 20 });
      if (error) throw error;
      const row = data as { error?: string; items?: unknown[] } | null;
      if (row?.error) throw new Error(row.error);
      setPendingCount(Array.isArray(row?.items) ? row.items.length : 0);
    } catch {
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    function handleChange() {
      void refresh();
    }

    window.addEventListener(MP_PAYMENT_EXCEPTIONS_CHANGED, handleChange);
    window.addEventListener("focus", handleChange);
    return () => {
      window.removeEventListener(MP_PAYMENT_EXCEPTIONS_CHANGED, handleChange);
      window.removeEventListener("focus", handleChange);
    };
  }, [refresh]);

  return { pendingCount, loading, refresh };
}
