import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";

export function SubscriptionBanner() {
  const { info, loading } = useSubscription();

  if (loading || !info || info.is_admin || info.can_book) return null;

  const message =
    info.subscription_notice ??
    (info.subscription_status === "grace"
      ? "Pagamento pendente. Regularize em até a data de tolerância para continuar agendando."
      : info.subscription_status === "trial"
        ? "Seu teste grátis terminou. Assine para liberar novos agendamentos."
        : "Assinatura inativa. Realize o pagamento para liberar novos agendamentos.");

  return (
    <div className="mx-4 mt-4 md:mx-8 md:mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex gap-2 text-sm text-amber-100 flex-1">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
        <p>{message}</p>
      </div>
      <Button asChild size="sm" className="rounded-full shrink-0 bg-gradient-brand text-white border-0">
        <Link to="/app/perfil">Ir para Perfil</Link>
      </Button>
    </div>
  );
}
