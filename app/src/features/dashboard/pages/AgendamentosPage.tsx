import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { DashboardPageSkeleton } from "@/components/layout/AppBootSkeleton";
import AgendamentosDesktopPanel from "@/features/dashboard/components/agendamentos/AgendamentosDesktopPanel";
import AgendamentosMobilePanel from "@/features/dashboard/components/agendamentos/AgendamentosMobilePanel";
import { buildVisibleBarbeariaIds } from "@/features/dashboard/lib/agendamentosPanel";
import { useSubscription } from "@/hooks/useSubscription";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";

export default function AgendamentosPage() {
  const isDesktop = useMediaMdUp();
  const { slug, barbeariaId, caBarbearias, shop, loading: shopLoading } = useDashboardShop();
  const { info: subscriptionInfo } = useSubscription();
  const isCA = subscriptionInfo?.account_type === "ca";

  const allBarbeariaIds = useMemo(
    () => buildVisibleBarbeariaIds(barbeariaId, caBarbearias, isCA),
    [barbeariaId, caBarbearias, isCA],
  );

  const booting = shopLoading && !slug;
  const syncingAgenda = Boolean(slug && !barbeariaId);

  useEffect(() => {
    document.title = "Agendamentos - Sentinela Agendamentos";
  }, []);

  if (booting) {
    return <DashboardPageSkeleton />;
  }

  if (!slug) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <header className="mb-6 pr-12">
          <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure sua empresa em Configurações para ver os agendamentos aqui.
          </p>
        </header>
        <Link
          to="/app/settings"
          className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-90 transition"
        >
          Ir para Configurações
        </Link>
      </div>
    );
  }

  if (isDesktop) {
    return (
      <AgendamentosDesktopPanel
        slug={slug}
        barbeariaId={barbeariaId}
        caBarbearias={caBarbearias}
        shop={shop}
        allBarbeariaIds={allBarbeariaIds}
        isCA={isCA}
      />
    );
  }

  return (
    <AgendamentosMobilePanel
      barbeariaId={barbeariaId}
      caBarbearias={caBarbearias}
      shop={shop}
      allBarbeariaIds={allBarbeariaIds}
      isCA={isCA}
      syncingAgenda={syncingAgenda}
    />
  );
}
