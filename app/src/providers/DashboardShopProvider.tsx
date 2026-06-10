import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase as agendaSupabase } from "@agenda/integrations/supabase/client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAgendaSyncPhase, primeAgendaSyncPhase } from "@/features/agenda/hooks/useEnsureAgendaSync";
import { isCacheFresh } from "@/lib/providerCache";

export type DashboardShop = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  slot_interval_minutes: number;
  slot_pause_minutes: number;
  allow_client_self_service: boolean;
};

type RefreshOptions = {
  force?: boolean;
};

type DashboardShopContextValue = {
  shop: DashboardShop | null;
  slug: string | null;
  barbeariaId: string | null;
  agendaReady: boolean;
  loading: boolean;
  refresh: (options?: RefreshOptions) => Promise<void>;
};

const DashboardShopContext = createContext<DashboardShopContextValue | null>(null);

let cachedUserId: string | null = null;
let cachedShop: DashboardShop | null = null;
let cachedBarbeariaId: string | null = null;
let cachedFetchedAt: number | null = null;

async function syncAgenda(slug: string) {
  const cached = getAgendaSyncPhase(slug);
  if (cached === "ready") return cached;

  const { data, error } = await supabase.rpc("ensure_agenda_from_barbershop_slug", {
    p_slug: slug,
  });

  if (error) {
    primeAgendaSyncPhase(slug, "error");
    return "error" as const;
  }
  if (!data) {
    primeAgendaSyncPhase(slug, "not_found");
    return "not_found" as const;
  }

  primeAgendaSyncPhase(slug, "ready");
  return "ready" as const;
}

async function resolveBarbeariaId(slug: string) {
  const { data } = await agendaSupabase.from("barbearias").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export function DashboardShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hasWarmCache = Boolean(userId && userId === cachedUserId && cachedShop);

  const [shop, setShop] = useState<DashboardShop | null>(() => (hasWarmCache ? cachedShop : null));
  const [barbeariaId, setBarbeariaId] = useState<string | null>(() => (hasWarmCache ? cachedBarbeariaId : null));
  const [loading, setLoading] = useState(!hasWarmCache);

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      if (!userId) {
        cachedUserId = null;
        cachedShop = null;
        cachedBarbeariaId = null;
        cachedFetchedAt = null;
        setShop(null);
        setBarbeariaId(null);
        setLoading(false);
        return;
      }

      const hasCache = cachedUserId === userId && cachedShop;
      const fresh = hasCache && isCacheFresh(cachedFetchedAt) && !options?.force;

      if (fresh) {
        setShop(cachedShop);
        setBarbeariaId(cachedBarbeariaId);
        setLoading(false);
        return;
      }

      if (!hasCache) {
        setLoading(true);
      }

      const { data } = await supabase
        .from("barbershops")
        .select("id, slug, display_name, avatar_url, slot_interval_minutes, slot_pause_minutes, allow_client_self_service")
        .eq("owner_id", userId)
        .maybeSingle();

      const row = (data as DashboardShop | null) ?? null;
      const normalized: DashboardShop | null = row
        ? { ...row, allow_client_self_service: row.allow_client_self_service ?? true }
        : null;
      cachedUserId = userId;
      cachedShop = normalized;
      cachedFetchedAt = Date.now();
      setShop(normalized);

      if (!row?.slug) {
        cachedBarbeariaId = null;
        setBarbeariaId(null);
        setLoading(false);
        return;
      }

      primeAgendaSyncPhase(row.slug, getAgendaSyncPhase(row.slug));
      setLoading(false);

      // Sincroniza agenda em segundo plano — o layout abre sem esperar.
      void (async () => {
        const phase = await syncAgenda(row.slug);
        if (phase === "ready") {
          const id =
            cachedBarbeariaId && cachedShop?.slug === row.slug
              ? cachedBarbeariaId
              : await resolveBarbeariaId(row.slug);
          cachedBarbeariaId = id;
          setBarbeariaId(id);
        } else {
          cachedBarbeariaId = null;
          setBarbeariaId(null);
        }
      })();
    },
    [userId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      shop,
      slug: shop?.slug ?? null,
      barbeariaId,
      agendaReady: Boolean(shop?.slug && getAgendaSyncPhase(shop.slug) === "ready"),
      loading,
      refresh,
    }),
    [shop, barbeariaId, loading, refresh],
  );

  return <DashboardShopContext.Provider value={value}>{children}</DashboardShopContext.Provider>;
}

export function useDashboardShop() {
  const context = useContext(DashboardShopContext);
  if (!context) {
    throw new Error("useDashboardShop must be used within DashboardShopProvider");
  }
  return context;
}

export function clearDashboardShopCache() {
  cachedUserId = null;
  cachedShop = null;
  cachedBarbeariaId = null;
  cachedFetchedAt = null;
}

export function patchDashboardShopCache(next: Partial<DashboardShop>) {
  if (!cachedShop) return;
  cachedShop = { ...cachedShop, ...next };
  cachedFetchedAt = Date.now();
}
