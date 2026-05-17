import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import PublicBooking from "@agenda/pages/PublicBooking";
import { AgendaShell } from "@/features/agenda/AgendaShell";
import { useEnsureAgendaSync } from "@/features/agenda/hooks/useEnsureAgendaSync";
import { Button } from "@/components/ui/button";

export default function PublicBookingRoute() {
  const { slug } = useParams<{ slug: string }>();
  const { phase, errorMsg } = useEnsureAgendaSync(slug);

  if (phase === "loading") {
    return (
      <AgendaShell>
        <BookingLoading />
      </AgendaShell>
    );
  }

  if (phase === "not_found") {
    return (
      <AgendaShell>
        <BookingNotFound />
      </AgendaShell>
    );
  }

  if (phase === "error") {
    return (
      <AgendaShell>
        <BookingError message={errorMsg} />
      </AgendaShell>
    );
  }

  return (
    <AgendaShell>
      <PublicBooking />
    </AgendaShell>
  );
}

function BookingLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Preparando agenda...</p>
    </div>
  );
}

function BookingNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Empresa não encontrada</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Verifique se o link está correto ou peça um novo link ao consultório.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}

function BookingError({ message }: { message: string | null }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
      <div>
        <h1 className="font-display text-xl font-bold">Não foi possível abrir a agenda</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">{message}</p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </div>
  );
}
