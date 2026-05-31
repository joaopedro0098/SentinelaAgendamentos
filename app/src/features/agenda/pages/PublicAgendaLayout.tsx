import { Link, Outlet, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AgendaShell } from "@/features/agenda/AgendaShell";
import { useEnsureAgendaSync } from "@/features/agenda/hooks/useEnsureAgendaSync";
import { Button } from "@/components/ui/button";

export default function PublicAgendaLayout() {
  const { slug } = useParams<{ slug: string }>();
  const { phase, errorMsg } = useEnsureAgendaSync(slug);

  if (phase === "loading") {
    return (
      <AgendaShell>
        <AgendaStatusScreen>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Preparando agenda...</p>
        </AgendaStatusScreen>
      </AgendaShell>
    );
  }

  if (phase === "not_found") {
    return (
      <AgendaShell>
        <AgendaStatusScreen>
          <div className="text-center space-y-2">
            <h1 className="font-display text-2xl font-bold">Empresa não encontrada</h1>
            <p className="text-muted-foreground text-sm">
              Verifique se o link está correto ou peça um novo link à barbearia.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </AgendaStatusScreen>
      </AgendaShell>
    );
  }

  if (phase === "error") {
    return (
      <AgendaShell>
        <AgendaStatusScreen>
          <div className="text-center space-y-2">
            <h1 className="font-display text-xl font-bold">Não foi possível abrir a agenda</h1>
            <p className="text-sm text-muted-foreground max-w-md">{errorMsg}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </AgendaStatusScreen>
      </AgendaShell>
    );
  }

  return (
    <AgendaShell>
      <Outlet />
    </AgendaShell>
  );
}

function AgendaStatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      {children}
    </div>
  );
}
