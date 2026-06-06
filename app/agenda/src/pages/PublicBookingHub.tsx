import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { CalendarDays, Download, List, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicShopHeader } from "@/components/PublicShopHeader";
import { useBarbeariaResumo } from "@/hooks/useBarbeariaResumo";
import {
  isIosDevice,
  isStandalonePwa,
  listenForInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pwaInstall";
import { ClientConfirmationPushToggle } from "@/components/ClientConfirmationPushToggle";

export default function PublicBookingHub() {
  const { slug } = useParams<{ slug: string }>();
  const { loading, barbearia } = useBarbeariaResumo(slug);
  const [installed, setInstalled] = useState(() => isStandalonePwa());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const isIos = typeof window !== "undefined" && isIosDevice();

  useEffect(() => {
    setInstalled(isStandalonePwa());
    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayMode = () => setInstalled(isStandalonePwa());
    media.addEventListener("change", onDisplayMode);
    return () => media.removeEventListener("change", onDisplayMode);
  }, []);

  useEffect(() => {
    if (installed) return;
    return listenForInstallPrompt((event) => setInstallPrompt(event));
  }, [installed]);

  async function handleInstallClick() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      setInstalled(isStandalonePwa());
      return;
    }
    setShowInstallHelp(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const base = `/agendar/${slug}`;
  const shopName = barbearia?.nome?.trim() || "sua barbearia";

  return (
    <div className="min-h-screen bg-surface px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        <PublicShopHeader
          nome={barbearia?.nome ?? null}
          logoUrl={barbearia?.logo_url ?? null}
          loading={loading}
          subtitle="Escolha uma opção abaixo"
        />

        <div className="space-y-3">
          <Button asChild className="w-full h-12 rounded-xl text-base font-semibold">
            <Link to={`${base}/agendar`}>
              <CalendarDays className="h-5 w-5" />
              Agendar
            </Link>
          </Button>

          <Button asChild variant="outline" className="w-full h-12 rounded-xl text-base font-semibold">
            <Link to={`${base}/meus-agendamentos`}>
              <List className="h-5 w-5" />
              Meus agendamentos
            </Link>
          </Button>
        </div>

        <div className="space-y-3">
          {!installed && (
            <Card className="border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
              <p className="flex items-start gap-2">
                <Smartphone className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  Instale e faça futuros agendamentos com{" "}
                  <span className="font-semibold">{shopName}</span> de forma mais fácil e rápida.{" "}
                  <span className="text-muted-foreground">(opcional)</span>
                </span>
              </p>
            </Card>
          )}

          <ClientConfirmationPushToggle shopName={shopName} />

          {!installed && (
            <>
              <Button
                type="button"
                variant="secondary"
                className="w-full h-12 rounded-xl text-base font-semibold"
                onClick={() => void handleInstallClick()}
              >
                <Download className="h-5 w-5" />
                Instalar o app
              </Button>

              {showInstallHelp && (
                <Card className="p-4 text-sm text-muted-foreground space-y-2">
                  <p className="font-semibold text-foreground">Como instalar de verdade</p>
                  <p>
                    O app instalado será de{" "}
                    <strong className="text-foreground">{shopName}</strong>, abrirá sem login e
                    funcionará como app separado — igual ao app do barbeiro, só que para agendar
                    nesta barbearia.
                  </p>
                  {installPrompt ? (
                    <p className="text-foreground">
                      Toque em <strong>Instalar o app</strong> acima. O Chrome mostrará a instalação
                      nativa (não use <strong>Criar atalho</strong> no menu, pois isso só abre no
                      navegador).
                    </p>
                  ) : isIos ? (
                    <p>
                      No <strong>Safari</strong>: Compartilhar →{" "}
                      <strong>Adicionar à Tela de Início</strong>. No iPhone essa é a forma correta
                      de instalar.
                    </p>
                  ) : (
                    <p>
                      Aguarde o botão <strong>Instalar o app</strong> acima ou o aviso do Chrome na
                      barra/endereço. Evite <strong>Criar atalho</strong> no menu ⋮ — isso não
                      instala o app completo.
                    </p>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
