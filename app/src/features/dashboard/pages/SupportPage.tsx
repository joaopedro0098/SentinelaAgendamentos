import { useEffect } from "react";
import { Headphones, MessageCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { openAppSupportWhatsApp } from "@/lib/supportWhatsApp";
import { SUPPORT_VIDEOS, resolveYouTubeVideoId } from "@/lib/supportVideos";

function SupportVideoEmbed({ title, youtubeIdOrUrl }: { title: string; youtubeIdOrUrl: string }) {
  const videoId = resolveYouTubeVideoId(youtubeIdOrUrl);

  if (!videoId) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border bg-secondary/30">
        <div className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground">
          <PlayCircle className="h-10 w-10 opacity-60" />
          <p className="text-sm font-medium">Vídeo em breve</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border/80 bg-black">
      <iframe
        title={title}
        src={`https://www.youtube.com/embed/${videoId}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="h-full w-full border-0"
      />
    </div>
  );
}

export default function SupportPage() {
  useEffect(() => {
    document.title = "Suporte — Sentinela Agendamentos";
  }, []);

  return (
    <div className="w-full max-w-3xl space-y-6 overflow-x-hidden p-4 md:p-6 mx-auto">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Headphones className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Suporte</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Aprenda a usar o Sentinela com os tutoriais abaixo. Se ainda precisar de ajuda, fale conosco no WhatsApp.
        </p>
      </header>

      <div className="space-y-4">
        {SUPPORT_VIDEOS.map((video) => (
          <Card key={video.title} className="glass-panel border-border/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{video.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <SupportVideoEmbed title={video.title} youtubeIdOrUrl={video.youtubeIdOrUrl} />
            </CardContent>
          </Card>
        ))}
      </div>

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
