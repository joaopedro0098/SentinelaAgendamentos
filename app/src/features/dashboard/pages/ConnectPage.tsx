import { useEffect } from "react";
import { Monitor, Plug2 } from "lucide-react";
import { ExtensionConnectSection } from "@/features/dashboard/components/ExtensionConnectSection";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";

export default function ConnectPage() {
  const isDesktop = useMediaMdUp();

  useEffect(() => {
    document.title = "Connect — Sentinela Agendamentos";
  }, []);

  if (!isDesktop) {
    return (
      <div className="panel-canvas-page p-4 md:p-6 max-w-3xl mx-auto w-full">
        <header className="space-y-1 mb-6">
          <div className="flex items-center gap-2">
            <Plug2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Connect</h1>
          </div>
        </header>
        <div className="rounded-xl border border-border/80 bg-card p-6 space-y-3 text-center">
          <Monitor className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            O Sentinela Connect funciona no <strong>WhatsApp Web no computador</strong>. Abra o painel no desktop
            para instalar a extensão e gerar o token.
          </p>
        </div>
      </div>
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
