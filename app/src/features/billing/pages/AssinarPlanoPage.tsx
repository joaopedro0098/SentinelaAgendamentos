import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { getPlanTier, type PlanTier } from "@/lib/planTiers";
import { STRIPE_PUBLISHABLE_KEY } from "@/lib/stripeApi";
import {
  createStripeSubscription,
  createSubscriptionPlanPix,
  syncStripeSubscription,
  verifySubscriptionPlanPix,
} from "@/lib/subscriptionPlanApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type CheckoutMethod = "cartao" | "pix";

type Props = {
  method: CheckoutMethod;
};

type StripeCheckoutFormProps = {
  subscriptionId: string | null;
  processing: boolean;
  setProcessing: (value: boolean) => void;
  onSuccess: () => void;
};

function StripeCheckoutForm({ subscriptionId, processing, setProcessing, onSuccess }: StripeCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/app/perfil`,
        },
        redirect: "if_required",
      });

      if (error) {
        throw new Error(error.message ?? "Pagamento não concluído.");
      }

      const sync = await syncStripeSubscription(subscriptionId);
      if (sync.error) throw new Error(sync.error);

      clearSubscriptionCache();
      onSuccess();
    } catch (e) {
      toast({
        title: "Pagamento não confirmado",
        description: e instanceof Error ? e.message : "Verifique os dados do cartão e tente novamente.",
        variant: "destructive",
      });
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
        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar assinatura"}
      </Button>
    </form>
  );
}

type StripePlanCheckoutProps = {
  tier: PlanTier;
  onSuccess: () => void;
};

function StripePlanCheckout({ tier, onSuccess }: StripePlanCheckoutProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const stripePromise = useMemo(() => loadStripe(STRIPE_PUBLISHABLE_KEY), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setClientSecret(null);

    void createStripeSubscription(tier)
      .then((data) => {
        if (!active) return;
        if (data.error) throw new Error(data.error);

        if (data.activated) {
          clearSubscriptionCache();
          onSuccess();
          return;
        }

        if (!data.client_secret) {
          throw new Error("Stripe não retornou confirmação de pagamento.");
        }

        setClientSecret(data.client_secret);
        setSubscriptionId(data.subscription_id ?? null);
      })
      .catch((e) => {
        if (!active) return;
        setLoadError(e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tier, onSuccess]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (!clientSecret || !stripePromise) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        locale: "pt-BR",
        appearance: { theme: "stripe" },
      }}
    >
      <StripeCheckoutForm
        subscriptionId={subscriptionId}
        processing={processing}
        setProcessing={setProcessing}
        onSuccess={onSuccess}
      />
    </Elements>
  );
}

export default function AssinarPlanoPage({ method }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useSubscription();

  const tierParam = searchParams.get("tier");
  const tierDef = getPlanTier(tierParam);
  const tier = tierDef?.id as PlanTier | undefined;

  const [loadingPix, setLoadingPix] = useState(method === "pix");
  const [pixError, setPixError] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pixQr, setPixQr] = useState<string | null>(null);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [verifyingPix, setVerifyingPix] = useState(false);

  const verifyInFlightRef = useRef(false);

  useEffect(() => {
    document.title =
      method === "cartao"
        ? `Assinar com cartão — ${tierDef?.name ?? "Plano"}`
        : `Assinar com Pix — ${tierDef?.name ?? "Plano"}`;
  }, [method, tierDef?.name]);

  useEffect(() => {
    if (method !== "pix" || !tier) return;

    let active = true;
    setLoadingPix(true);
    setPixError(null);

    void createSubscriptionPlanPix(tier)
      .then((data) => {
        if (!active) return;
        if (!data.qr_code) throw new Error(data.error ?? "Não foi possível gerar o Pix.");
        setPaymentId(data.payment_id != null ? String(data.payment_id) : null);
        setPixQr(data.qr_code);
        setPixQrBase64(data.qr_code_base64 ?? null);
      })
      .catch((e) => {
        if (!active) return;
        setPixError(e instanceof Error ? e.message : "Não foi possível gerar o Pix.");
      })
      .finally(() => {
        if (active) setLoadingPix(false);
      });

    return () => {
      active = false;
    };
  }, [method, tier]);

  const handleCardSuccess = useCallback(async () => {
    await refresh({ force: true });
    toast({ title: "Assinatura ativa", description: "Pagamento confirmado com sucesso." });
    navigate("/app/perfil", { replace: true });
  }, [navigate, refresh]);

  const verifyPix = useCallback(async () => {
    if (!tier || verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    setVerifyingPix(true);
    try {
      const result = await verifySubscriptionPlanPix(tier, paymentId);
      if (result.activated) {
        clearSubscriptionCache();
        await refresh({ force: true });
        toast({ title: "Plano ativo", description: "Pagamento Pix confirmado." });
        navigate("/app/perfil", { replace: true });
        return;
      }
      toast({
        title: "Pix pendente",
        description: "Ainda não identificamos o pagamento. Aguarde alguns segundos e tente novamente.",
      });
    } catch (e) {
      toast({
        title: "Verificação falhou",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      verifyInFlightRef.current = false;
      setVerifyingPix(false);
    }
  }, [tier, paymentId, navigate, refresh]);

  if (!tierDef || !tier) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <p className="text-sm text-destructive">Plano inválido. Escolha Start ou Pro em Conta.</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/app/perfil">
            <ArrowLeft className="h-4 w-4" /> Voltar para Conta
          </Link>
        </Button>
      </div>
    );
  }

  if (method === "pix") {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <Button asChild variant="ghost" size="sm" className="rounded-full -ml-2">
          <Link to="/app/perfil">
            <ArrowLeft className="h-4 w-4" /> Conta
          </Link>
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Plano {tierDef.name} — Pix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">Valor mensal</p>
              <p className="font-display text-2xl font-bold">{tierDef.priceShort}</p>
            </div>

            {loadingPix && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {pixError && <p className="text-sm text-destructive">{pixError}</p>}

            {!loadingPix && pixQrBase64 && (
              <div className="rounded-xl border border-border p-4 text-center space-y-3">
                <p className="text-sm font-medium">Escaneie o QR Code ou copie o código Pix</p>
                <img
                  src={`data:image/png;base64,${pixQrBase64}`}
                  alt="QR Code Pix"
                  className="mx-auto max-w-[220px]"
                />
                {pixQr && (
                  <p className="text-xs break-all text-muted-foreground bg-muted/40 rounded-lg p-2">{pixQr}</p>
                )}
                <Button
                  type="button"
                  className="w-full rounded-full bg-gradient-brand text-white border-0"
                  disabled={verifyingPix}
                  onClick={() => void verifyPix()}
                >
                  {verifyingPix ? <Loader2 className="h-4 w-4 animate-spin" /> : "Já paguei — verificar"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!STRIPE_PUBLISHABLE_KEY) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <p className="text-sm text-destructive">
          Pagamento com cartão não configurado (VITE_STRIPE_PUBLISHABLE_KEY).
        </p>
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
          <CreditCard className="h-6 w-6" /> Assinar plano {tierDef.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tierDef.priceLabel}. O teste gratuito é gerenciado pelo Sentinela — o cartão só é necessário para
          assinar o plano.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tierDef.priceLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StripePlanCheckout tier={tier} onSuccess={() => void handleCardSuccess()} />

          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-full"
            onClick={() => navigate("/app/perfil")}
          >
            Voltar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function AssinarPlanoCartaoPage() {
  return <AssinarPlanoPage method="cartao" />;
}

export function AssinarPlanoPixPage() {
  return <AssinarPlanoPage method="pix" />;
}
