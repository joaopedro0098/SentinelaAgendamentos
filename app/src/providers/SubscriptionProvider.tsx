import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { SubscriptionInfo } from "@/hooks/useSubscription";
import { isCacheFresh } from "@/lib/providerCache";

type RefreshOptions = {
  force?: boolean;
};

type SubscriptionContextValue = {
  info: SubscriptionInfo | null;
  loading: boolean;
  refresh: (options?: RefreshOptions) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

let cachedUserId: string | null = null;
let cachedInfo: SubscriptionInfo | null = null;
let cachedFetchedAt: number | null = null;

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hasWarmCache = Boolean(userId && userId === cachedUserId && cachedInfo);

  const [info, setInfo] = useState<SubscriptionInfo | null>(() => (hasWarmCache ? cachedInfo : null));
  const [loading, setLoading] = useState(!hasWarmCache);

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      if (!userId) {
        cachedUserId = null;
        cachedInfo = null;
        cachedFetchedAt = null;
        setInfo(null);
        setLoading(false);
        return;
      }

      const hasCache = cachedUserId === userId && cachedInfo;
      const fresh = hasCache && isCacheFresh(cachedFetchedAt) && !options?.force;

      if (fresh) {
        setInfo(cachedInfo);
        setLoading(false);
        return;
      }

      if (!hasCache) {
        setLoading(true);
      }

      const { data, error } = await supabase.rpc("get_my_subscription");
      if (!error && data && typeof data === "object" && !("error" in data)) {
        const next = data as SubscriptionInfo;
        cachedUserId = userId;
        cachedInfo = next;
        cachedFetchedAt = Date.now();
        setInfo(next);
      } else {
        cachedUserId = userId;
        cachedInfo = null;
        cachedFetchedAt = Date.now();
        setInfo(null);
      }
      setLoading(false);
    },
    [userId],
  );

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
  cachedFetchedAt = null;
}
