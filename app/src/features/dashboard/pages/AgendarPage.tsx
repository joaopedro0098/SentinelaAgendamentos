import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import PublicBooking from "@agenda/pages/PublicBooking";
import { AgendaShell } from "@/features/agenda/AgendaShell";
import { useEnsureAgendaSync } from "@/features/agenda/hooks/useEnsureAgendaSync";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function AgendarPage() {
  const { user } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const { phase, errorMsg } = useEnsureAgendaSync(slug ?? undefined);

  useEffect(() => {
    document.title = "Agendar - Sentinela Agendamentos";
  }, []);

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

  if (loadingShop || phase === "loading") {
    return (
      <AgendaShell>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6">
          <BackToPanel />
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
          <BackToPanel />
          <div>
            <h1 className="font-display text-xl font-bold">Empresa nao configurada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Complete o cadastro em Configuracoes antes de agendar.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/app/settings">Ir para Configuracoes</Link>
          </Button>
        </div>
      </AgendaShell>
    );
  }

  if (phase === "error") {
    return (
      <AgendaShell>
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center gap-4">
          <BackToPanel />
          <div>
            <h1 className="font-display text-xl font-bold">Nao foi possivel abrir a agenda</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">{errorMsg}</p>
          </div>
        </div>
      </AgendaShell>
    );
  }

  return (
    <AgendaShell>
      <PublicBooking slugOverride={slug} backHref="/app/settings" hideMeusAgendamentos />
    </AgendaShell>
  );
}

function BackToPanel() {
  return (
    <Link
      to="/app/settings"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground self-start"
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar
    </Link>
  );
}
