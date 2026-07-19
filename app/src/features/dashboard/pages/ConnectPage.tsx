import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Plug2, Loader2 } from "lucide-react";
import { ExtensionConnectSection } from "@/features/dashboard/components/ExtensionConnectSection";
import { PanelUnderDevelopment } from "@/features/dashboard/components/PanelUnderDevelopment";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";
import { useSubscription } from "@/hooks/useSubscription";

export default function ConnectPage() {
  const isDesktop = useMediaMdUp();
  const { info: subscriptionInfo, loading: subscriptionLoading } = useSubscription();

  useEffect(() => {
    document.title = "Connect — Sentinela Agendamentos";
  }, []);

  if (!isDesktop) {
    return <Navigate to="/app/agendamentos" replace />;
  }

  if (subscriptionLoading && subscriptionInfo == null) {
    return (
      <div className="panel-canvas-page p-4 md:p-6 max-w-3xl mx-auto w-full flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }

  if (!subscriptionInfo?.is_admin) {
    return (
      <PanelUnderDevelopment
        title="Connect"
        icon={Plug2}
        description="O Sentinela Connect ainda não está liberado para sua conta. Em breve você poderá usar a extensão no WhatsApp Web daqui."
      />
    );
  }

  return (
    <div className="panel-canvas-page p-4 md:p-6 max-w-3xl mx-auto space-y-6 w-full">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Plug2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Connect</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Extensão Chrome para ver dados do paciente no WhatsApp Web. Siga os passos abaixo — depois de instalada,
          a extensão recebe o token automaticamente daqui.
        </p>
      </header>

      <ExtensionConnectSection />
    </div>
  );
}
