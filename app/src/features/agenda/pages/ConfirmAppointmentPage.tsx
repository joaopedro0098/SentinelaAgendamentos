import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AgendaShell } from "@/features/agenda/AgendaShell";

type AppointmentPreview = {
  data: string;
  hora: string;
  cliente_nome: string;
  client_confirmed_at: string | null;
  barbearias: { nome: string } | null;
  barbeiros: { nome: string } | null;
};

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function ConfirmAppointmentPage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const token = routeToken ?? "";
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<AppointmentPreview | null>(null);

  useEffect(() => {
    document.title = "Confirmar agendamento - Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;

    (async () => {
      setLoading(true);
      const { data, error: fnError } = await supabase.functions.invoke("confirm-appointment", {
        body: { token, action: "preview" },
      });

      if (!active) return;
      if (fnError || data?.error) {
        setError(data?.error ?? fnError?.message ?? "Não foi possível carregar o agendamento.");
      } else {
        setAppointment(data.appointment);
        const already = Boolean(data.appointment?.client_confirmed_at);
        setConfirmed(already);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [token]);

  async function handleConfirm() {
    if (!token) return;
    setConfirming(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke("confirm-appointment", {
      body: { token, action: "confirm" },
    });

    setConfirming(false);
    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? "Não foi possível confirmar.");
      return;
    }

    setAppointment(data.appointment);
    setConfirmed(true);
    setJustConfirmed(true);
  }

  function handleClose() {
    window.close();
  }

  return (
    <AgendaShell>
      <div className="min-h-screen flex items-center justify-center p-5">
        <Card className="relative w-full max-w-md p-6 text-center">
          {!loading && !error && confirmed && (
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {loading ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Carregando agendamento...</p>
            </div>
          ) : error ? (
            <>
              <h1 className="font-display text-xl font-bold">Não foi possível confirmar</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </>
          ) : appointment ? (
            <>
              {(confirmed || justConfirmed) && (
                <div
                  className={cn(
                    "mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-brand shadow-glow",
                    justConfirmed && "animate-[reveal-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both]",
                  )}
                >
                  <Check className="h-7 w-7 text-white" strokeWidth={2.5} />
                </div>
              )}

              <h1 className={cn("font-display text-xl font-bold", (confirmed || justConfirmed) && "mt-4")}>
                {confirmed ? "Tudo certo!" : "Confirme seu agendamento"}
              </h1>

              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {confirmed ? (
                  <>
                    Obrigado, <span className="font-medium text-foreground">{appointment.cliente_nome}</span>! Seu
                    horário em <span className="font-medium text-foreground">{appointment.barbearias?.nome ?? "barbearia"}</span>{" "}
                    está confirmado para{" "}
                    <span className="font-medium text-foreground">{formatDate(appointment.data)}</span> às{" "}
                    <span className="font-medium text-foreground">{String(appointment.hora).slice(0, 5)}</span>
                    {appointment.barbeiros?.nome ? (
                      <>
                        {" "}
                        com <span className="font-medium text-foreground">{appointment.barbeiros.nome}</span>
                      </>
                    ) : null}
                    .
                  </>
                ) : (
                  <>
                    {appointment.barbearias?.nome ?? "Barbearia"} —{" "}
                    <span className="font-medium text-foreground">{formatDate(appointment.data)}</span> às{" "}
                    <span className="font-medium text-foreground">{String(appointment.hora).slice(0, 5)}</span>
                    {appointment.barbeiros?.nome ? (
                      <>
                        {" "}
                        com <span className="font-medium text-foreground">{appointment.barbeiros.nome}</span>
                      </>
                    ) : null}
                    .
                  </>
                )}
              </p>

              {!confirmed && (
                <Button
                  className="mt-6 w-full rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
                  disabled={confirming}
                  onClick={handleConfirm}
                >
                  {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirmar"}
                </Button>
              )}

              {confirmed && (
                <p className="mt-5 text-xs text-muted-foreground">Pode fechar esta página.</p>
              )}
            </>
          ) : null}
        </Card>
      </div>
    </AgendaShell>
  );
}
