import { Play, ArrowRight, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const VideoDemo = () => {
  return (
    <section className="relative pt-4 pb-12">
      <div className="container">
        <div className="max-w-5xl mx-auto">
          <div className="relative group">
            {/* gradient border wrapper */}
            <div className="absolute -inset-1 bg-gradient-brand rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
            <div className="relative glass rounded-3xl overflow-hidden glow-border">
              <div className="aspect-video w-full relative bg-secondary/40 flex items-center justify-center">
                <video
                  controls
                  className="w-full h-full object-cover"
                  poster=""
                >
                  <source src="/demo.mp4" type="video/mp4" />
                </video>

                {/* Overlay placeholder enquanto não há vídeo */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-gradient-to-br from-[hsl(var(--brand-green)/0.16)] via-transparent to-[hsl(var(--brand-mint)/0.18)]">
                  <div className="w-20 h-20 rounded-full bg-gradient-brand flex items-center justify-center shadow-glow animate-float">
                    <Play className="w-8 h-8 text-white ml-1" fill="white" />
                  </div>
                  <p className="mt-6 text-sm text-muted-foreground bg-background/60 px-4 py-2 rounded-full backdrop-blur">
                    📁 Adicione seu vídeo em <code className="text-foreground">/public/demo.mp4</code>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTAs abaixo do vídeo */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Button
              asChild
              size="lg"
              className="bg-gradient-brand hover:opacity-90 text-white border-0 rounded-full px-8 h-14 text-base shadow-glow animate-pulse-glow w-full sm:w-auto"
            >
              <Link to="/signup">Teste 14 dias grátis <ArrowRight className="w-5 h-5 ml-1" /></Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full px-8 h-14 text-base bg-transparent border-border hover:bg-secondary w-full sm:w-auto"
            >
              <a href="https://wa.me/" target="_blank" rel="noopener noreferrer">
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
