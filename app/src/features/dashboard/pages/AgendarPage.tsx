import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import PublicBooking, { type RescheduleContext } from "@agenda/pages/PublicBooking";
import { AgendaShell } from "@/features/agenda/AgendaShell";
import { useEnsureAgendaSync } from "@/features/agenda/hooks/useEnsureAgendaSync";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { getOwnerBookingBlockMessage, showOwnerBookingBlockedToast } from "@/lib/subscriptionMessages";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type LocationState = {
  reschedule?: RescheduleContext;
};

export default function AgendarPage() {
  const { user } = useAuth();
  const { info: subscriptionInfo } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const reschedule = (location.state as LocationState | null)?.reschedule ?? null;

  const [slug, setSlug] = useState<string | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const { phase, errorMsg } = useEnsureAgendaSync(slug ?? undefined);

  useEffect(() => {
    document.title = reschedule ? "Alterar horário - Sentinela Agendamentos" : "Agendar - Sentinela Agendamentos";
  }, [reschedule]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      setLoadingShop(true);
      const { data } = await supabase
        .from("barbershops")
        .select("slug")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (active) {
        setSlug(data?.slug ?? null);
        setLoadingShop(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const backHref = reschedule ? "/app/agendamentos" : "/app/settings";

  if (loadingShop || phase === "loading") {
    return (
      <AgendaShell>
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
      <AgendaShell>
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

  if (phase === "error") {
    return (
      <AgendaShell>
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center gap-4">
          <BackToPanel to={backHref} />
          <div>
            <h1 className="font-display text-xl font-bold">Não foi possível abrir a agenda</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">{errorMsg}</p>
          </div>
        </div>
      </AgendaShell>
    );
  }

  const ownerBookingBlockMessage =
    subscriptionInfo && !subscriptionInfo.can_book && !subscriptionInfo.is_admin
      ? getOwnerBookingBlockMessage(subscriptionInfo)
      : undefined;

  return (
    <AgendaShell>
      <PublicBooking
        slugOverride={slug}
        backHref={backHref}
        ownerPanel
        reschedule={reschedule}
        onRescheduleComplete={() => navigate("/app/agendamentos", { replace: true })}
        ownerBookingBlockMessage={ownerBookingBlockMessage}
        onOwnerBookingBlocked={showOwnerBookingBlockedToast}
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
