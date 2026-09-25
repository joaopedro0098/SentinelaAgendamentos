import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { AgendaShell } from "@/features/agenda/AgendaShell";
import { PublicBookingPaymentCheckout } from "@agenda/components/booking/PublicBookingPaymentCheckout";
import { createAppointmentPaymentCheckout } from "@agenda/lib/appointmentPaymentApi";

export default function AppointmentPaymentPage() {
  const { token: routeToken } = useParams<{ token: string }>();
  const token = routeToken ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agendamentoId, setAgendamentoId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Awaited<ReturnType<typeof createAppointmentPaymentCheckout>> | null>(
    null,
  );
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    document.title = "Pagamento — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await supabase.rpc("resolve_agendamento_payment_by_token", {
          p_confirmation_token: token,
        });
        if (rpcErr) throw new Error(rpcErr.message);
        const row = data as {
          ok?: boolean;
          error?: string;
          agendamento_id?: string;
          confirmation_token?: string;
        } | null;
        if (!row?.ok || !row.agendamento_id) {
          throw new Error(
            row?.error === "not_found"
              ? "Link inválido ou agendamento não encontrado."
              : "Este agendamento não está aguardando pagamento.",
          );
        }
        if (!active) return;
        setAgendamentoId(row.agendamento_id);
        const checkoutData = await createAppointmentPaymentCheckout({
          agendamento_id: row.agendamento_id,
          confirmation_token: row.confirmation_token ?? token,
        });
        if (!active) return;
        setCheckout(checkoutData);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Não foi possível carregar o pagamento.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <AgendaShell>
      <div className="min-h-screen flex items-center justify-center p-5">
        <Card className="w-full max-w-md p-6">
          {loading ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Carregando pagamento…</p>
            </div>
          ) : error ? (
            <>
              <h1 className="font-display text-xl font-bold">Pagamento indisponível</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </>
          ) : paid ? (
            <>
              <h1 className="font-display text-xl font-bold">Pagamento confirmado</h1>
              <p className="mt-2 text-sm text-muted-foreground">Seu horário foi confirmado. Pode fechar esta página.</p>
            </>
          ) : checkout && agendamentoId ? (
            <>
              <h1 className="font-display text-xl font-bold mb-4">Pagamento do agendamento</h1>
              <PublicBookingPaymentCheckout
                amountPixCentavos={checkout.amount_pix_centavos}
                amountCardCentavos={checkout.amount_card_centavos}
                passFeeCard={checkout.payment_pass_fee_card === true}
                passFeePix={checkout.payment_pass_fee_pix === true}
                remainingCentavos={checkout.remaining_centavos}
                expiresAt={checkout.expires_at}
                agendamentoId={agendamentoId}
                confirmationToken={token}
                enableCard={checkout.payment_enable_card}
                enablePix={checkout.payment_enable_pix}
                maxInstallments={checkout.payment_max_installments}
                onPaid={() => setPaid(true)}
                onExpired={() => setError("A reserva expirou. Peça um novo link ao profissional.")}
                onFailed={() => setError("Não foi possível concluir o pagamento. Tente novamente ou fale com o profissional.")}
              />
            </>
          ) : null}
        </Card>
      </div>
    </AgendaShell>
  );
}
