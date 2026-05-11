import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageCircle, Scissors, ArrowRight } from "lucide-react";
import { useEffect } from "react";

const Index = () => {
  useEffect(() => {
    document.title = "BarberChat — Atendimento via chat para barbearias";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "Converse com sua barbearia. Atendimento por chat com agente virtual integrado.",
    );
  }, []);

  return (
    <main className="min-h-screen bg-chat-app-bg flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto">
        <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-5 shadow-md">
          <Scissors className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold mb-2">BarberChat</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Converse com sua barbearia direto pelo navegador. Rápido, simples e sem instalar nada.
        </p>

        <Button asChild size="lg" className="w-full h-12 mb-3">
          <Link to="/c/demo">
            <MessageCircle className="h-5 w-5" />
            Abrir conversa de demonstração
          </Link>
        </Button>

        <Button asChild variant="outline" size="lg" className="w-full h-12">
          <Link to="/login">
            Sou dono de uma barbearia <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </main>
  );
};

export default Index;
