import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bell, CalendarDays, Download, List, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShopAvatar } from "@/components/ShopAvatar";
import {
  isIosDevice,
  isStandalonePwa,
  listenForInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/lib/pushNotifications";

type BarbeariaResumo = {
  nome: string;
  logo_url: string | null;
};

export default function PublicBookingHub() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [barbearia, setBarbearia] = useState<BarbeariaResumo | null>(null);
  const [installed, setInstalled] = useState(false);
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

  useEffect(() => {
    if (!slug) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("barbearias")
        .select("nome, logo_url")
        .eq("slug", slug)
        .maybeSingle();
      if (!active) return;
      setBarbearia(data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  async function handleInstallClick() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
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

  return (
    <div className="min-h-screen bg-surface px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <ShopAvatar
            logoUrl={barbearia?.logo_url ?? null}
            name={barbearia?.nome ?? "Barbearia"}
            className="h-16 w-16 mx-auto"
          />
          <h1 className="font-display text-2xl font-bold">{barbearia?.nome ?? "Agendamento"}</h1>
          <p className="text-sm text-muted-foreground">Escolha uma opção abaixo</p>
        </div>

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

        {!installed && (
          <div className="space-y-3">
            <Card className="border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
              <p className="flex items-start gap-2">
                <Bell className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                Instale para receber lembrete automático 1 dia antes do seu corte.
              </p>
            </Card>

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
                <p className="font-semibold text-foreground">Como instalar</p>
                {isIos ? (
                  <p>
                    No Safari: toque em <strong>Compartilhar</strong> →{" "}
                    <strong>Adicionar à Tela de Início</strong>. Depois abra pelo ícone criado.
                  </p>
                ) : (
                  <p>
                    No menu do navegador, escolha <strong>Instalar app</strong> ou{" "}
                    <strong>Adicionar à tela inicial</strong>.
                  </p>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
