import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import MeusAgendamentos from "@agenda/pages/MeusAgendamentos";
import { AgendaShell } from "@/features/agenda/AgendaShell";
import { useEnsureAgendaSync } from "@/features/agenda/hooks/useEnsureAgendaSync";

export default function MeusAgendamentosRoute() {
  const { slug } = useParams<{ slug: string }>();
  const { phase } = useEnsureAgendaSync(slug);

  if (phase !== "ready") {
    return (
      <AgendaShell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AgendaShell>
    );
  }

  return (
    <AgendaShell>
      <MeusAgendamentos />
    </AgendaShell>
  );
}

