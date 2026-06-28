import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatServicePrice } from "@/lib/servicePrice";
import {
  STRIPE_PUBLISHABLE_KEY,
  verifyAppointmentPayment,
} from "@/lib/appointmentPaymentApi";

type Props = {
  clientSecret: string;
  stripeConnectAccountId: string;
  amountCentavos: number;
  expiresAt: string | null;
  agendamentoId: string;
  confirmationToken: string;
  onPaid: () => void;
  onExpired: () => void;
  onFailed: () => void;
};

function isPaidIntentStatus(status: string | undefined) {
  return status === "succeeded" || status === "processing";
}

function PaymentForm({
  clientSecret,
  amountCentavos,
  expiresAt,
  agendamentoId,
  confirmationToken,
  onPaid,
  onExpired,
  onFailed,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<"pay" | "confirm">("pay");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const stripeReady = Boolean(stripe && elements);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) onExpired();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, onExpired]);

  async function pollConfirmed() {
    setPhase("confirm");
    for (let i = 0; i < 20; i += 1) {
      try {
        const result = await verifyAppointmentPayment({
          agendamento_id: agendamentoId,
          confirmation_token: confirmationToken,
        });
        if (result.status === "confirmado" || result.ok) {
          onPaid();
          return;
        }
        if (result.status === "cancelado") {
          onFailed();
          return;
        }
      } catch {
        /* próxima tentativa */
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    toast.message("Pagamento recebido. Aguarde a confirmação do agendamento.");
    onPaid();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setPhase("pay");

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message ?? "Verifique os dados do cartão.");
        return;
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (error) {
        toast.error(error.message ?? "Pagamento não concluído. Tente novamente.");
        if (error.type !== "card_error" && error.type !== "validation_error") {
          onFailed();
        }
        return;
      }

      const status = paymentIntent?.status;
      if (isPaidIntentStatus(status)) {
        await pollConfirmed();
        return;
      }

      if (status === "requires_action") {
        toast.error("Autenticação do cartão não concluída. Tente novamente.");
        return;
      }

      toast.error("Não foi possível confirmar o pagamento. Tente novamente.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar pagamento.");
    } finally {
      setSubmitting(false);
      setPhase("pay");
    }
  }

  const timerLabel =
    secondsLeft != null
      ? `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`
      : null;

  const buttonLabel =
    phase === "confirm" ? "Confirmando agendamento…" : submitting ? "Processando pagamento…" : "Pagar e confirmar";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">Valor a pagar agora</p>
        <p className="font-display text-2xl font-bold">{formatServicePrice(amountCentavos)}</p>
        {timerLabel && (
          <p className="mt-1 text-xs text-muted-foreground">
            Horário reservado por mais <span className="font-semibold text-foreground">{timerLabel}</span>
          </p>
        )}
      </div>
      {!stripeReady ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando formulário de cartão…
        </div>
      ) : (
        <PaymentElement options={{ layout: "tabs" }} />
      )}
      <Button type="submit" className="w-full rounded-full" disabled={!stripeReady || submitting}>
        {submitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            {buttonLabel}
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Pagar e confirmar
          </>
        )}
      </Button>
    </form>
  );
}

export function PublicBookingPaymentCheckout(props: Props) {
  const stripePromise = useMemo(() => {
    if (!STRIPE_PUBLISHABLE_KEY || !props.stripeConnectAccountId) return null;
    return loadStripe(STRIPE_PUBLISHABLE_KEY, {
      stripeAccount: props.stripeConnectAccountId,
    });
  }, [props.stripeConnectAccountId]);

  if (!stripePromise) {
    const missingKey = !STRIPE_PUBLISHABLE_KEY;
    return (
      <p className="text-sm text-destructive text-center">
        {missingKey
          ? "Chave pública Stripe (teste) não configurada no site (VITE_STRIPE_PUBLISHABLE_KEY)."
          : "Conta Stripe Connect não retornou. Abra Pagamentos no painel, sincronize e tente de novo."}
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret, locale: "pt-BR" }}>
      <PaymentForm {...props} />
    </Elements>
  );
}
