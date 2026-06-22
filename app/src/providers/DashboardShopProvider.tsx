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
  allow_client_self_service: boolean;
  allow_client_public_booking: boolean;
  contact_phone: string | null;
  welcome_support_pending: boolean;
};

export type CaBarbearia = {
  barbeariaId: string;
  slug: string;
  shopName: string;
};

type RefreshOptions = {
  force?: boolean;
};

type DashboardShopContextValue = {
  shop: DashboardShop | null;
  slug: string | null;
  barbeariaId: string | null;
  /** Barbearias das CAs ativas do CT/AA. Vazio para CA ou usuário sem CAs. */
  caBarbearias: CaBarbearia[];
  agendaReady: boolean;
  loading: boolean;
  refresh: (options?: RefreshOptions) => Promise<void>;
  patchShop: (next: Partial<DashboardShop>) => void;
};

const DashboardShopContext = createContext<DashboardShopContextValue | null>(null);

let cachedUserId: string | null = null;
let cachedShop: DashboardShop | null = null;
let cachedBarbeariaId: string | null = null;
let cachedCaBarbearias: CaBarbearia[] = [];
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

async function fetchCaBarbearias(): Promise<CaBarbearia[]> {
  const { data, error } = await supabase.rpc("ct_list_ca_info");
  if (error || !Array.isArray(data)) return [];

  const rows = data as { barbearia_id: string | null; slug: string; shop_display_name: string }[];
  const resolved = await Promise.all(
    rows.map(async (r) => {
      const barbeariaId = r.barbearia_id ?? (r.slug ? await resolveBarbeariaId(r.slug) : null);
      if (!barbeariaId || !r.slug) return null;
      return {
        barbeariaId,
        slug: r.slug,
        shopName: r.shop_display_name,
      };
    }),
  );

  return resolved.filter((r): r is CaBarbearia => r !== null);
}

export function DashboardShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hasWarmCache = Boolean(userId && userId === cachedUserId && cachedShop);

  const [shop, setShop] = useState<DashboardShop | null>(() => (hasWarmCache ? cachedShop : null));
  const [barbeariaId, setBarbeariaId] = useState<string | null>(() => (hasWarmCache ? cachedBarbeariaId : null));
  const [caBarbearias, setCaBarbearias] = useState<CaBarbearia[]>(() => (hasWarmCache ? cachedCaBarbearias : []));
  const [loading, setLoading] = useState(!hasWarmCache);
  const [syncTick, setSyncTick] = useState(0);

  const refresh = useCallback(
    async (options?: RefreshOptions) => {
      if (!userId) {
        cachedUserId = null;
        cachedShop = null;
        cachedBarbeariaId = null;
        cachedCaBarbearias = [];
        cachedFetchedAt = null;
        setShop(null);
        setBarbeariaId(null);
        setCaBarbearias([]);
        setLoading(false);
        return;
      }

      const hasCache = cachedUserId === userId && cachedShop;
      const fresh = hasCache && isCacheFresh(cachedFetchedAt) && !options?.force;

      if (fresh) {
        setShop(cachedShop);
        setBarbeariaId(cachedBarbeariaId);
        setCaBarbearias(cachedCaBarbearias);
        setLoading(false);
        return;
      }

      if (!hasCache) {
        setLoading(true);
      }

      const { data } = await supabase
        .from("barbershops")
        .select(
          "id, slug, display_name, avatar_url, slot_interval_minutes, allow_client_self_service, allow_client_public_booking, contact_phone, welcome_support_pending",
        )
        .eq("owner_id", userId)
        .maybeSingle();

      const row = (data as DashboardShop | null) ?? null;
      const normalized: DashboardShop | null = row
        ? {
            ...row,
            allow_client_self_service: row.allow_client_self_service ?? true,
            allow_client_public_booking: row.allow_client_public_booking ?? true,
            contact_phone: row.contact_phone ?? null,
            welcome_support_pending: row.welcome_support_pending ?? false,
          }
        : null;
      cachedUserId = userId;
      cachedShop = normalized;
      cachedFetchedAt = Date.now();
      setShop(normalized);

      if (!row?.slug) {
        cachedBarbeariaId = null;
        cachedCaBarbearias = [];
        setBarbeariaId(null);
        setCaBarbearias([]);
        setLoading(false);
        return;
      }

      primeAgendaSyncPhase(row.slug, "loading");
      setLoading(false);

      // Sincroniza agenda do titular e das CAs ativas em segundo plano
      void (async () => {
        const caRows = await supabase.rpc("ct_list_ca_info");
        const caSlugs = Array.isArray(caRows.data)
          ? (caRows.data as { slug: string }[]).map((r) => r.slug).filter(Boolean)
          : [];

        await Promise.all([syncAgenda(row.slug), ...caSlugs.map((caSlug) => syncAgenda(caSlug))]);

        const caBarbeariasList = await fetchCaBarbearias();
        cachedCaBarbearias = caBarbeariasList;
        setCaBarbearias(caBarbeariasList);

        const phase = getAgendaSyncPhase(row.slug);
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
        setSyncTick((n) => n + 1);
      })();
    },
    [userId],
  );

  const patchShop = useCallback((next: Partial<DashboardShop>) => {
    if (!cachedShop) return;
    const merged = { ...cachedShop, ...next };
    cachedShop = merged;
    cachedFetchedAt = Date.now();
    setShop(merged);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      shop,
      slug: shop?.slug ?? null,
      barbeariaId,
      caBarbearias,
      agendaReady: Boolean(shop?.slug && barbeariaId && getAgendaSyncPhase(shop.slug) === "ready"),
      loading,
      refresh,
      patchShop,
    }),
    [shop, barbeariaId, caBarbearias, loading, refresh, patchShop, syncTick],
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
  cachedCaBarbearias = [];
  cachedFetchedAt = null;
}

export function patchDashboardShopCache(next: Partial<DashboardShop>) {
  if (!cachedShop) return;
  cachedShop = { ...cachedShop, ...next };
  cachedFetchedAt = Date.now();
}
