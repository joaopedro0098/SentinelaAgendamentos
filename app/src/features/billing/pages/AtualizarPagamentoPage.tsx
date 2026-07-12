import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CreditCard } from "lucide-react";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { completeStripePaymentMethodUpdate } from "@/lib/subscriptionPlanApi";
import { STRIPE_PUBLISHABLE_KEY } from "@/lib/stripeApi";
import { canUpdateStripePaymentMethod } from "@/lib/subscriptionMessages";
import { StripePaymentMethodSetup } from "@/features/billing/components/StripePaymentMethodSetup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

export default function AtualizarPagamentoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { info, loading, refresh } = useSubscription();
  const [formError, setFormError] = useState<string | null>(null);

  const reactivateAfterUpdate = searchParams.get("reativar") === "1";

  useEffect(() => {
    document.title = reactivateAfterUpdate
      ? "Atualizar cartão e reativar — Sentinela"
      : "Atualizar forma de pagamento — Sentinela";
  }, [reactivateAfterUpdate]);

  useEffect(() => {
    if (loading) return;
    if (!canUpdateStripePaymentMethod(info)) {
      navigate("/app/perfil", { replace: true });
    }
  }, [loading, info, navigate]);

  const handleSuccess = useCallback(
    async (setupIntentId: string) => {
      const result = await completeStripePaymentMethodUpdate(setupIntentId, reactivateAfterUpdate);
      if (result.error) throw new Error(result.error);

      clearSubscriptionCache();
      await refresh({ force: true });

      if (reactivateAfterUpdate) {
        toast({
          title: "Assinatura reativada",
          description: "Cartão atualizado e renovação automática restaurada.",
        });
      } else {
        toast({
          title: "Cartão atualizado",
          description: "O novo cartão será usado na próxima cobrança automática.",
        });
      }

      navigate("/app/perfil", { replace: true });
    },
    [navigate, reactivateAfterUpdate, refresh],
  );

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

  if (loading || !canUpdateStripePaymentMethod(info)) {
    return null;
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
          <CreditCard className="h-6 w-6" />
          {reactivateAfterUpdate ? "Atualizar cartão e reativar" : "Atualizar forma de pagamento"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {reactivateAfterUpdate
            ? "Informe o novo cartão. Depois de salvar, a assinatura será reativada sem cobrança agora."
            : "Informe o novo cartão. Não haverá cobrança agora — ele será usado na próxima renovação."}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Novo cartão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <StripePaymentMethodSetup
            onSuccess={handleSuccess}
            onError={(message) => setFormError(message)}
          />

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
