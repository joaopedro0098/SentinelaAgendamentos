import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import PublicBooking, { type RescheduleContext } from "@agenda/pages/PublicBooking";
import { AgendaShell } from "@/features/agenda/AgendaShell";
import { getAgendaSyncPhase } from "@/features/agenda/hooks/useEnsureAgendaSync";
import { useSubscription } from "@/hooks/useSubscription";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { getOwnerBookingBlockMessage, showOwnerBookingBlockedToast } from "@/lib/subscriptionMessages";
import { Button } from "@/components/ui/button";

type LocationState = {
  reschedule?: RescheduleContext;
};

export default function AgendarPage() {
  const { info: subscriptionInfo } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const reschedule = (location.state as LocationState | null)?.reschedule ?? null;
  const { slug, loading, agendaReady, caBarbearias } = useDashboardShop();
  const syncPhase = slug ? getAgendaSyncPhase(slug) ?? "loading" : undefined;

  useEffect(() => {
    document.title = reschedule ? "Alterar horário - Sentinela Agendamentos" : "Agendar - Sentinela Agendamentos";
  }, [reschedule]);

  const backHref = reschedule ? "/app/agendamentos" : "/app/settings";
  const booting = loading && !slug;

  // Aguarda a linha em `barbearias` existir — senão PublicBooking mostra "não encontrada".
  if (booting || (slug && !agendaReady)) {
    if (syncPhase === "error") {
      return (
        <AgendaShell variant="dashboard">
          <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center gap-4">
            <BackToPanel to={backHref} />
            <div>
              <h1 className="font-display text-xl font-bold">Não foi possível abrir a agenda</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-md">
                A sincronização da agenda falhou. Tente novamente em instantes.
              </p>
            </div>
          </div>
        </AgendaShell>
      );
    }

    if (syncPhase === "not_found") {
      return (
        <AgendaShell variant="dashboard">
          <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center gap-4">
            <BackToPanel to={backHref} />
            <div>
              <h1 className="font-display text-xl font-bold">Agenda ainda não disponível</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-md">
                Aguarde alguns segundos e abra esta aba novamente. Se persistir, verifique Configurações.
              </p>
            </div>
          </div>
        </AgendaShell>
      );
    }

    return (
      <AgendaShell variant="dashboard">
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6">
          <BackToPanel to={backHref} label={reschedule ? "Agendamentos" : "Voltar"} />
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Preparando agenda...</p>
        </div>
      </AgendaShell>
    );
  }

  if (!slug) {
    return (
      <AgendaShell variant="dashboard">
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center gap-4">
          <BackToPanel to="/app/settings" />
          <div>
            <h1 className="font-display text-xl font-bold">Empresa não configurada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Complete o cadastro em Configurações antes de agendar.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/app/settings">Ir para Configurações</Link>
          </Button>
        </div>
      </AgendaShell>
    );
  }

  const ownerBookingBlockMessage =
    subscriptionInfo && !subscriptionInfo.can_book && !subscriptionInfo.is_admin
      ? getOwnerBookingBlockMessage(subscriptionInfo)
      : undefined;

  return (
    <AgendaShell variant="dashboard">
      <PublicBooking
        slugOverride={slug}
        backHref={backHref}
        ownerPanel
        ownerPanelActive={location.pathname === "/app/agendar"}
        reschedule={reschedule}
        onRescheduleComplete={() => navigate("/app/agendamentos", { replace: true })}
        ownerBookingBlockMessage={ownerBookingBlockMessage}
        onOwnerBookingBlocked={showOwnerBookingBlockedToast}
        extraBarbeariaIds={caBarbearias.map((ca) => ca.barbeariaId)}
      />
    </AgendaShell>
  );
}

function BackToPanel({ to, label = "Voltar" }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground self-start"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
