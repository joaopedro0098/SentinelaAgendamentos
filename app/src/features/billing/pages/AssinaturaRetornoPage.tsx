import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Legado MP redirect — assinatura por cartão agora é Stripe (sem retorno externo). */
export default function AssinaturaRetornoPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Assinatura — Sentinela Agendamentos";
    navigate("/app/perfil", { replace: true });
  }, [navigate]);

  return null;
}
