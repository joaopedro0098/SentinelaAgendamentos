import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
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
        setConfirmed(Boolean(data.appointment?.client_confirmed_at));
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
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-5">
      <Card className="w-full max-w-md p-6 text-center">
        {loading ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando agendamento...</p>
          </div>
        ) : error ? (
          <>
            <h1 className="font-display text-xl font-bold">Não foi possível confirmar</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button asChild variant="outline" className="mt-6 rounded-full">
              <Link to="/">Voltar ao início</Link>
            </Button>
          </>
        ) : appointment ? (
          <>
            <div className="mx-auto h-12 w-12 rounded-full bg-available/10 flex items-center justify-center">
              <Check className="h-6 w-6 text-available" />
            </div>
            <h1 className="mt-4 font-display text-xl font-bold">
              {confirmed ? "Agendamento confirmado!" : "Confirme seu agendamento"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {appointment.barbearias?.nome ?? "Barbearia"} espera você em{" "}
              <b className="text-foreground">{formatDate(appointment.data)}</b> às{" "}
              <b className="text-foreground">{String(appointment.hora).slice(0, 5)}</b>
              {appointment.barbeiros?.nome ? <> com <b className="text-foreground">{appointment.barbeiros.nome}</b></> : null}.
            </p>

            {!confirmed && (
              <Button className="mt-6 w-full rounded-full" disabled={confirming} onClick={handleConfirm}>
                {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirmar agendamento"}
              </Button>
            )}

            {confirmed && (
              <p className="mt-5 text-sm text-muted-foreground">
                Obrigado! Seu horário permanece reservado.
              </p>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
