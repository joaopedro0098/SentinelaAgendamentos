import { ArrowRight, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DemoPlayerProps = {
  src: string;
  aspectClassName: string;
  fileHint: string;
  className?: string;
};

function DemoPlayer({ src, aspectClassName, fileHint, className }: DemoPlayerProps) {
  return (
    <div className={cn("relative group w-full", className)}>
      <div className="absolute -inset-1 bg-gradient-brand rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
      <div className="relative glass rounded-3xl overflow-hidden glow-border">
        <div className={cn("w-full relative bg-secondary/40", aspectClassName)}>
          <video
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src={src} type="video/mp4" />
          </video>
        </div>
      </div>
      <p className="sr-only">
        Vídeo de demonstração. Arquivo esperado: {fileHint}
      </p>
    </div>
  );
}

const VideoDemo = () => {
  return (
    <section className="relative pt-4 pb-12">
      <div className="container">
        <div className="max-w-5xl mx-auto">
          {/* Mobile: vertical 9:16 */}
          <DemoPlayer
            src="/demo-mobile.mp4"
            aspectClassName="aspect-[9/16]"
            fileHint="/public/demo-mobile.mp4"
            className="md:hidden max-w-[min(100%,280px)] mx-auto"
          />

          {/* Desktop: horizontal 16:9 (inalterado) */}
          <DemoPlayer
            src="/demo.mp4"
            aspectClassName="aspect-video"
            fileHint="/public/demo.mp4"
            className="hidden md:block"
          />

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
