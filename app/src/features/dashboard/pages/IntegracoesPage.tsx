import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { WhatsAppIntegrationCard } from "@/features/dashboard/components/integracoes/WhatsAppIntegrationCard";
import { IntegrationAlertsDotModal } from "@/features/dashboard/components/integracoes/IntegrationAlertsDotModal";
import { useIntegracaoAlertasProfissional } from "@/features/dashboard/hooks/useIntegracaoAlertasProfissional";

export default function IntegracoesPage() {
  const isDesktop = useMediaMdUp();
  const { barbeariaId } = useDashboardShop();
  const { alertas, loading, refresh, count } = useIntegracaoAlertasProfissional(barbeariaId);

  useEffect(() => {
    document.title = "Integrações — Sentinela Agendamentos";
  }, []);

  if (!isDesktop) {
    return <Navigate to="/app/agendamentos" replace />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Integrações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie as conexões e canais de comunicação do seu estabelecimento.
          </p>
        </div>
        {(count > 0 || loading) && (
          <IntegrationAlertsDotModal alertas={alertas} loading={loading} onDismissed={() => void refresh()} />
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <WhatsAppIntegrationCard />
      </div>
    </div>
  );
}
