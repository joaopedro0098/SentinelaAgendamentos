import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { invokeBillingFunction, STRIPE_PUBLISHABLE_KEY } from "@/lib/billingApi";
import { PLAN_PRICE_LABEL } from "@/lib/planPricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type CheckoutPayload = {
  client_secret: string;
  return_url: string;
};

function CheckoutForm({ returnUrl }: { returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    setSubmitting(false);

    if (error) {
      toast({
        title: "Pagamento não concluído",
        description: error.message ?? "Verifique os dados do cartão e tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      <Button
        type="submit"
        className="w-full rounded-full bg-gradient-brand text-white border-0"
        disabled={!stripe || !elements || submitting}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirmar assinatura — ${PLAN_PRICE_LABEL}`}
      </Button>
      <Button type="button" variant="ghost" className="w-full rounded-full" onClick={() => navigate("/app/perfil")}>
        Voltar
      </Button>
    </form>
  );
}

export default function AssinarCartaoPage() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stripePromise = useMemo(() => {
    if (!STRIPE_PUBLISHABLE_KEY) return null;
    return loadStripe(STRIPE_PUBLISHABLE_KEY);
  }, []);

  useEffect(() => {
    document.title = "Assinar com cartão — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!STRIPE_PUBLISHABLE_KEY) {
      setError("Pagamento com cartão não configurado (VITE_STRIPE_PUBLISHABLE_KEY).");
      setLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        const data = await invokeBillingFunction<CheckoutPayload>("stripe-create-subscription");
        if (!active) return;
        setClientSecret(data.client_secret);
        setReturnUrl(data.return_url);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !clientSecret || !returnUrl || !stripePromise) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <p className="text-sm text-destructive">{error ?? "Não foi possível carregar o pagamento."}</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/app/perfil">
            <ArrowLeft className="h-4 w-4" /> Voltar para Conta
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto w-full space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="rounded-full -ml-2 mb-2">
          <Link to="/app/perfil">
            <ArrowLeft className="h-4 w-4" /> Conta
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6" /> Assinar com cartão
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cobrança automática todo mês. Você cancela quando quiser em Conta.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{PLAN_PRICE_LABEL}</CardTitle>
        </CardHeader>
        <CardContent>
          <Elements stripe={stripePromise} options={{ clientSecret, locale: "pt-BR" }}>
            <CheckoutForm returnUrl={returnUrl} />
          </Elements>
        </CardContent>
      </Card>
    </div>
  );
}
