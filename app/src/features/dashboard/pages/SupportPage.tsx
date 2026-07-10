import { useEffect } from "react";
import { ExternalLink, Headphones, MessageCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { openAppSupportWhatsApp } from "@/lib/supportWhatsApp";
import { SUPPORT_VIDEOS } from "@/lib/supportVideos";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { markWelcomeSupportSeen } from "@/lib/welcomeSupport";

export default function SupportPage() {
  const { shop, patchShop } = useDashboardShop();

  useEffect(() => {
    document.title = "Suporte — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!shop?.welcome_support_pending) return;

    void markWelcomeSupportSeen(shop.id).then((ok) => {
      if (ok) {
        patchShop({ welcome_support_pending: false });
      }
    });
  }, [shop?.id, shop?.welcome_support_pending, patchShop]);

  return (
    <div className="panel-canvas-page w-full max-w-3xl space-y-6 p-4 md:p-6 mx-auto">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Headphones className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Suporte</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Aprenda a usar o Sentinela com os tutoriais abaixo. Os vídeos abrem no YouTube. Se ainda precisar de ajuda,
          fale conosco no WhatsApp.
        </p>
      </header>

      <Card className="glass-panel border-border/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tutoriais em vídeo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ol className="divide-y divide-border/60">
            {SUPPORT_VIDEOS.map((video, index) => (
              <li key={video.url}>
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-secondary/40 active:bg-secondary/60"
                >
                  <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  <PlayCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{video.title}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </a>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border/80">
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Ainda precisa de ajuda?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Nossa equipe responde pelo WhatsApp em horário comercial.
            </p>
          </div>
          <Button
            type="button"
            className="w-full rounded-full bg-gradient-brand text-white hover:opacity-90 sm:w-auto"
            onClick={openAppSupportWhatsApp}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Falar no WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
