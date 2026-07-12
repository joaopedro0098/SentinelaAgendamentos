import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { startStripePaymentMethodUpdate } from "@/lib/subscriptionPlanApi";
import { STRIPE_PUBLISHABLE_KEY } from "@/lib/stripeApi";
import { Button } from "@/components/ui/button";

type SetupFormProps = {
  processing: boolean;
  setProcessing: (value: boolean) => void;
  onSuccess: (setupIntentId: string) => void;
  onError: (message: string) => void;
};

function StripePaymentMethodSetupForm({ processing, setProcessing, onSuccess, onError }: SetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/app/perfil`,
        },
        redirect: "if_required",
      });

      if (error) {
        throw new Error(error.message ?? "Não foi possível salvar o cartão.");
      }

      if (!setupIntent?.id) {
        throw new Error("Stripe não retornou a confirmação do cartão.");
      }

      if (setupIntent.status !== "succeeded") {
        throw new Error("Confirmação do cartão ainda não concluída.");
      }

      onSuccess(setupIntent.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Não foi possível salvar o cartão.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <Button
        type="submit"
        className="w-full rounded-full bg-gradient-brand text-white border-0"
        disabled={!stripe || !elements || processing}
      >
        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar cartão"}
      </Button>
    </form>
  );
}

type Props = {
  submitLabel?: string;
  onSuccess: (setupIntentId: string) => void | Promise<void>;
  onError: (message: string) => void;
};

export function StripePaymentMethodSetup({ onSuccess, onError }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const stripePromise = useMemo(() => loadStripe(STRIPE_PUBLISHABLE_KEY), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setClientSecret(null);

    void startStripePaymentMethodUpdate()
      .then((data) => {
        if (!active) return;
        if (data.error) throw new Error(data.error);
        if (!data.client_secret) {
          throw new Error("Stripe não retornou confirmação do cartão.");
        }
        setClientSecret(data.client_secret);
      })
      .catch((e) => {
        if (!active) return;
        const message = e instanceof Error ? e.message : "Não foi possível iniciar a atualização.";
        setLoadError(message);
        onError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onError]);

  async function handleSuccess(setupIntentId: string) {
    setProcessing(true);
    try {
      await onSuccess(setupIntentId);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível salvar o cartão.";
      onError(message);
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !clientSecret || !stripePromise) {
    return <p className="text-sm text-destructive">{loadError ?? "Não foi possível carregar o formulário."}</p>;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        locale: "pt-BR",
        appearance: { theme: "stripe" },
      }}
    >
      <StripePaymentMethodSetupForm
        processing={processing}
        setProcessing={setProcessing}
        onSuccess={(setupIntentId) => void handleSuccess(setupIntentId)}
        onError={(message) => onError(message)}
      />
    </Elements>
  );
}
