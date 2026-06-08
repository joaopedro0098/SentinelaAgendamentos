import { ArrowRight, MessageCircle, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LANDING_DEMO_YOUTUBE } from "@/lib/landingDemoVideo";
import { resolveYouTubeVideoId } from "@/lib/supportVideos";

const LANDING_WHATSAPP_URL = `https://wa.me/5511999773308?text=${encodeURIComponent(
  "Olá, vim pelo site Sentinela Agendamentos e gostaria de saber mais sobre.",
)}`;

function LandingDemoPlayer({ className }: { className?: string }) {
  const videoId = resolveYouTubeVideoId(LANDING_DEMO_YOUTUBE);

  return (
    <div className={cn("relative group w-full", className)}>
      <div className="absolute -inset-1 bg-gradient-brand rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
      <div className="relative glass rounded-3xl overflow-hidden glow-border">
        {videoId ? (
          <div className="aspect-[9/16] w-full bg-black">
            <iframe
              title="Demonstração Sentinela Agendamentos"
              src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          <div className="flex aspect-[9/16] w-full items-center justify-center bg-secondary/40">
            <div className="flex flex-col items-center gap-2 px-4 text-center text-muted-foreground">
              <PlayCircle className="h-12 w-12 opacity-60" />
              <p className="text-sm font-medium">Vídeo demo em breve</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const VideoDemo = () => {
  return (
    <section className="relative pt-4 pb-12">
      <div className="container">
        <div className="max-w-5xl mx-auto">
          <LandingDemoPlayer className="max-w-[min(100%,320px)] mx-auto" />

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Button
              asChild
              size="lg"
              className="bg-gradient-brand hover:opacity-90 text-white border-0 rounded-full px-8 h-14 text-base shadow-glow animate-pulse-glow w-full sm:w-auto"
            >
              <Link to="/signup">
                Teste 14 dias grátis <ArrowRight className="w-5 h-5 ml-1" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full px-8 h-14 text-base bg-transparent border-border hover:bg-secondary w-full sm:w-auto"
            >
              <a href={LANDING_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-5 h-5 mr-1" /> Fale conosco
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default VideoDemo;
