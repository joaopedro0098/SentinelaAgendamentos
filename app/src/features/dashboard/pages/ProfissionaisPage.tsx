import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { StaffOperationsSection } from "@/features/dashboard/components/StaffOperationsSection";
import { BloqueiosSection } from "@/features/dashboard/components/BloqueiosSection";
import { CtAggregatedAccountsSection } from "@/features/dashboard/components/CtAggregatedAccountsSection";
import { usePanelProfissionaisScrollTop } from "@/features/dashboard/hooks/usePanelProfissionaisScrollTop";

export default function ProfissionaisPage() {
  usePanelProfissionaisScrollTop();
  const { shop, loading } = useDashboardShop();
  const { info: subscriptionInfo } = useSubscription();
  const isCA = subscriptionInfo?.account_type === "ca";
  const canManageAggregated = subscriptionInfo?.can_manage_aggregated_accounts ?? false;

  useEffect(() => {
    document.title = "Profissionais — Sentinela Agendamentos";
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Profissionais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure sua empresa em Configurações para gerenciar a equipe aqui.
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

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 w-full">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profissionais</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Equipe de atendimento, bloqueios de horário e contas agregadas.
        </p>
      </header>

      <StaffOperationsSection
        barbershopId={shop.id}
        barbershopSlug={shop.slug}
        maxActiveStaff={isCA ? 1 : undefined}
      />

      <BloqueiosSection barbershopId={shop.id} barbershopSlug={shop.slug} />

      {canManageAggregated && <CtAggregatedAccountsSection />}
    </div>
  );
}
