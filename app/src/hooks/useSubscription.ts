import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type SubscriptionInfo = {
  is_admin: boolean;
  can_book: boolean;
  subscription_status: string;
  trial_days_left?: number;
  trial_last_day?: string;
  current_period_end?: string | null;
  grace_until?: string | null;
  subscription_notice?: string | null;
  plan_price_label?: string;
  label?: string;
  mp_subscription_id?: string | null;
};

export function useSubscription() {
  const { user } = useAuth();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setInfo(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_subscription");
    if (!error && data && typeof data === "object" && !("error" in data)) {
      setInfo(data as SubscriptionInfo);
    } else {
      setInfo(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { info, loading, refresh };
}

export async function checkBarbeariaCanBook(barbeariaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_barbearia_pode_agendar", {
    p_barbearia_id: barbeariaId,
  });
  if (error) return false;
  return Boolean(data);
}
