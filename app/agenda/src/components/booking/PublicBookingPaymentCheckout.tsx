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

function PaymentForm({
  amountCentavos,
  expiresAt,
  agendamentoId,
  confirmationToken,
  onPaid,
  onExpired,
  onFailed,
}: Omit<Props, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

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
    for (let i = 0; i < 15; i += 1) {
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
      await new Promise((r) => setTimeout(r, 1500));
    }
    toast.message("Pagamento recebido. Aguarde a confirmação do agendamento.");
    onPaid();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message ?? "Pagamento não concluído. Tente novamente.");
      if (error.type === "card_error" || error.type === "validation_error") return;
      onFailed();
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      await pollConfirmed();
      return;
    }

    toast.error("Não foi possível confirmar o pagamento.");
  }

  const timerLabel =
    secondsLeft != null
      ? `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`
      : null;

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
      <PaymentElement options={{ layout: "tabs" }} />
      <Button type="submit" className="w-full rounded-full" disabled={!stripe || !elements || submitting}>
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
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
    return (
      <p className="text-sm text-destructive text-center">
        Pagamento online indisponível no momento.
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret, locale: "pt-BR" }}>
      <PaymentForm {...props} />
    </Elements>
  );
}
