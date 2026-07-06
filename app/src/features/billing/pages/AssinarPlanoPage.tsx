import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { initMercadoPago, Payment } from "@mercadopago/sdk-react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { getPlanTier, type PlanTier } from "@/lib/planTiers";
import { MP_PUBLIC_KEY } from "@/lib/paymentsApi";
import {
  createPreapprovalCard,
  createSubscriptionPlanPix,
  verifySubscriptionPlanPix,
} from "@/lib/subscriptionPlanApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

let mpInitialized = false;

function ensureMpInit() {
  if (!MP_PUBLIC_KEY || mpInitialized) return;
  initMercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
  mpInitialized = true;
}

type CheckoutMethod = "cartao" | "pix";

type Props = {
  method: CheckoutMethod;
};

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
  const [processingCard, setProcessingCard] = useState(false);
  const [verifyingPix, setVerifyingPix] = useState(false);
  const [brickRetryKey, setBrickRetryKey] = useState(0);

  const verifyInFlightRef = useRef(false);

  useEffect(() => {
    document.title =
      method === "cartao"
        ? `Assinar com cartão — ${tierDef?.name ?? "Plano"}`
        : `Assinar com Pix — ${tierDef?.name ?? "Plano"}`;
  }, [method, tierDef?.name]);

  useEffect(() => {
    if (method === "cartao") ensureMpInit();
  }, [method]);

  useEffect(() => {
    if (method !== "pix" || !tier) return;

    let active = true;
    setLoadingPix(true);
    setPixError(null);

    void createSubscriptionPlanPix(tier)
      .then((data) => {
        if (!active) return;
        if (!data.qr_code) throw new Error(data.error ?? "Não foi possível gerar o Pix.");
        setPaymentId(data.payment_id ?? null);
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

  const initialization = useMemo(
    () => ({ amount: Math.max(1, tierDef?.amount ?? 1) }),
    [tierDef?.amount],
  );

  const customization = useMemo(
    () => ({
      paymentMethods: {
        creditCard: "all" as const,
        maxInstallments: 1,
      },
    }),
    [],
  );

  const handleCardSubmit = useCallback(
    async (formData: unknown) => {
      if (!tier) return;
      setProcessingCard(true);
      try {
        const result = await createPreapprovalCard(tier, formData as Record<string, unknown>);
        if (result.error) throw new Error(result.error);

        clearSubscriptionCache();
        await refresh({ force: true });

        if (result.ui_status === "approved") {
          toast({ title: "Assinatura ativa", description: "Pagamento confirmado com sucesso." });
          navigate("/app/perfil", { replace: true });
          return;
        }

        if (result.preapproval_id) {
          navigate(`/app/perfil/assinatura/retorno?preapproval_id=${encodeURIComponent(result.preapproval_id)}`, {
            replace: true,
          });
          return;
        }

        throw new Error("Mercado Pago não retornou a confirmação da assinatura.");
      } catch (e) {
        toast({
          title: "Pagamento não concluído",
          description: e instanceof Error ? e.message : "Verifique os dados e tente novamente.",
          variant: "destructive",
        });
        setBrickRetryKey((key) => key + 1);
      } finally {
        setProcessingCard(false);
      }
    },
    [tier, navigate, refresh],
  );

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
            <CardTitle className="text-base">
              Plano {tierDef.name} — Pix
            </CardTitle>
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

  if (!MP_PUBLIC_KEY) {
    return (
      <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
        <p className="text-sm text-destructive">Pagamento com cartão não configurado (VITE_MP_PUBLIC_KEY).</p>
        <Button asChild variant="outline" className="rounded-full">
          <Link to="/app/perfil">
            <ArrowLeft className="h-4 w-4" /> Voltar para Conta
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm" className="rounded-full -ml-2">
        <Link to="/app/perfil">
          <ArrowLeft className="h-4 w-4" /> Conta
        </Link>
      </Button>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Plano {tierDef.name} — Cartão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">Valor mensal após 14 dias grátis</p>
            <p className="font-display text-2xl font-bold">{tierDef.priceShort}</p>
          </div>

          <Payment
            id={`mp-plan-card-${tier}-${brickRetryKey}`}
            initialization={initialization}
            customization={customization}
            onSubmit={async (formData) => {
              await handleCardSubmit(formData);
            }}
            onError={(error) => {
              const message =
                typeof error === "object" && error && "message" in error
                  ? String((error as { message?: string }).message)
                  : "Erro no formulário de pagamento.";
              toast({ title: "Erro no Mercado Pago", description: message, variant: "destructive" });
            }}
          />

          {processingCard && (
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed">
            Cobrança mensal recorrente via Mercado Pago. Você pode cancelar a qualquer momento em Conta.
          </p>
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
