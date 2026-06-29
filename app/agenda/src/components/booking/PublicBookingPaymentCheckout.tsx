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

type Phase = "pay" | "confirm" | "pix";

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
  const [phase, setPhase] = useState<Phase>("pay");
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

  async function pollUntilAppointmentConfirmed(options: { pix?: boolean }) {
    setPhase(options.pix ? "pix" : "confirm");
    const maxAttempts = options.pix ? 100 : 20;
    const intervalMs = options.pix ? 3000 : 1200;

    for (let i = 0; i < maxAttempts; i += 1) {
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
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (options.pix) {
      toast.message("Ainda aguardando o Pix. Mantenha esta página aberta ou volte em instantes.");
      return;
    }

    toast.message("Pagamento recebido. Aguarde a confirmação do agendamento.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setPhase("pay");

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        toast.error(submitError.message ?? "Verifique os dados de pagamento.");
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
      if (status === "succeeded") {
        await pollUntilAppointmentConfirmed({ pix: false });
        return;
      }

      if (status === "processing") {
        await pollUntilAppointmentConfirmed({ pix: true });
        return;
      }

      if (status === "requires_action") {
        await pollUntilAppointmentConfirmed({ pix: true });
        return;
      }

      toast.error("Não foi possível confirmar o pagamento. Tente novamente.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao processar pagamento.");
    } finally {
      setSubmitting(false);
    }
  }

  const timerLabel =
    secondsLeft != null
      ? `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`
      : null;

  const buttonLabel =
    phase === "pix"
      ? "Aguardando confirmação do Pix…"
      : phase === "confirm"
        ? "Confirmando agendamento…"
        : submitting
          ? "Processando pagamento…"
          : "Pagar e confirmar";

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
      {phase === "pix" && (
        <p className="text-sm text-center text-muted-foreground leading-relaxed px-2">
          Aguardando confirmação do Pix… Assim que o banco confirmar, seu agendamento será confirmado
          automaticamente.
        </p>
      )}
      {phase === "pay" && (
        !stripeReady ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando opções de pagamento…
          </div>
        ) : (
          <PaymentElement options={{ layout: "tabs" }} />
        )
      )}
      <Button type="submit" className="w-full rounded-full" disabled={!stripeReady || submitting || phase !== "pay"}>
        {submitting || phase !== "pay" ? (
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
          ? "Chave pública Stripe não configurada no site (VITE_STRIPE_PUBLISHABLE_KEY)."
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
