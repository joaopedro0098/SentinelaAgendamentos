import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";

export default function IntegracoesPage() {
  const isDesktop = useMediaMdUp();

  useEffect(() => {
    document.title = "Integrações — Sentinela Agendamentos";
  }, []);

  if (!isDesktop) {
    return <Navigate to="/app/agendamentos" replace />;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie as conexões e canais de comunicação do seu estabelecimento.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="w-56 p-4 flex flex-col items-center justify-center text-center space-y-1.5 rounded-xl hover:bg-accent/40 transition-colors">
          <img
            src="/whatsapp-icon.png"
            alt="WhatsApp"
            className="h-28 w-28 object-contain"
          />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">WhatsApp</h3>
            <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              conectar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
