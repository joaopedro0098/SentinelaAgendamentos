import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { SubscriptionInfo } from "@/hooks/useSubscription";

type SubscriptionContextValue = {
  info: SubscriptionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

let cachedUserId: string | null = null;
let cachedInfo: SubscriptionInfo | null = null;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [info, setInfo] = useState<SubscriptionInfo | null>(() =>
    userId && userId === cachedUserId ? cachedInfo : null,
  );
  const [loading, setLoading] = useState(() => !(userId && userId === cachedUserId && cachedInfo));

  const refresh = useCallback(async () => {
    if (!userId) {
      cachedUserId = null;
      cachedInfo = null;
      setInfo(null);
      setLoading(false);
      return;
    }

    setLoading((current) => (cachedUserId === userId && cachedInfo ? current : true));

    const { data, error } = await supabase.rpc("get_my_subscription");
    if (!error && data && typeof data === "object" && !("error" in data)) {
      const next = data as SubscriptionInfo;
      cachedUserId = userId;
      cachedInfo = next;
      setInfo(next);
    } else {
      cachedUserId = userId;
      cachedInfo = null;
      setInfo(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ info, loading, refresh }), [info, loading, refresh]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscriptionContext must be used within SubscriptionProvider");
  }
  return context;
}

export function clearSubscriptionCache() {
  cachedUserId = null;
  cachedInfo = null;
}
