import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { Blocks } from "lucide-react";
import { PanelUnderDevelopment } from "@/features/dashboard/components/PanelUnderDevelopment";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";

export default function IntegracoesPage() {
  const isDesktop = useMediaMdUp();

  useEffect(() => {
    document.title = "Integrações — Sentinela Agendamentos";
  }, []);

  if (!isDesktop) {
    return <Navigate to="/app/agendamentos" replace />;
  }

  return <PanelUnderDevelopment title="Integrações" icon={Blocks} />;
}
