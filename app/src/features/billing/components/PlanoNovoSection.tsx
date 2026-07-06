import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import type { SubscriptionInfo } from "@/hooks/useSubscription";
import { PLAN_TIERS, planTierLabel, type PlanTier } from "@/lib/planTiers";
import { cancelMpPreapproval } from "@/lib/subscriptionPlanApi";
import { accountUsesExternalPlan } from "@/lib/subscriptionMessages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

function formatDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

type Props = {
  info: SubscriptionInfo | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
};

export function PlanoNovoSection({ info, loading, onRefresh }: Props) {
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);

  const usesExternalPlan = accountUsesExternalPlan(info);
  const isActive = info?.subscription_status === "active";
  const activeTier = (info?.subscription_tier as PlanTier | null | undefined) ?? null;
  const canSubscribe = !info?.is_admin && !loading && !usesExternalPlan && !isActive;
  const canCancel = !info?.is_admin && !usesExternalPlan && isActive;

  async function handleCancel() {
    if (!confirm("Cancelar a assinatura? Você mantém o acesso até o fim do período já pago.")) return;
    setCancelling(true);
    try {
      const data = await cancelMpPreapproval();
      if (data.error) throw new Error(data.error);
      toast({
        title: "Assinatura cancelada",
        description: "O acesso continua até a data de vencimento.",
      });
      await onRefresh();
    } catch (e) {
      toast({
        title: "Não foi possível cancelar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }

  function goCheckout(tier: PlanTier, method: "cartao" | "pix") {
    navigate(`/app/perfil/assinar-plano/${method}?tier=${tier}`);
  }

  if (usesExternalPlan) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Plano Novo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando planos…</p>
        ) : isActive && activeTier ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[hsl(var(--brand-green))]/30 bg-[hsl(var(--brand-green))]/10 px-4 py-3 text-sm">
              <p className="font-semibold">
                Plano {planTierLabel(activeTier)} ativo
              </p>
              {info?.current_period_end && (
                <p className="text-muted-foreground mt-1">
                  Vencimento: {formatDateBr(info.current_period_end)}
                </p>
              )}
              {activeTier === "start" && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Para cobrar consultas no link público, faça upgrade para o plano Pro.
                </p>
              )}
            </div>
            {canCancel && (
              <Button
                variant="outline"
                className="w-full rounded-full"
                onClick={() => void handleCancel()}
                disabled={cancelling}
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar assinatura"}
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              14 dias grátis no cartão (Mercado Pago). Pix ativa o plano na hora após o pagamento.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PLAN_TIERS.map((tier) => (
                <div
                  key={tier.id}
                  className="rounded-xl border border-border p-4 flex flex-col gap-3"
                >
                  <div>
                    <p className="font-display font-bold text-lg">{tier.name}</p>
                    <p className="text-sm font-medium text-[hsl(var(--brand-green))]">{tier.priceLabel}</p>
                  </div>
                  <ul className="space-y-1.5 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[hsl(var(--brand-green))]" aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {canSubscribe && (
                    <div className="space-y-2 pt-1">
                      <Button
                        className="w-full rounded-full bg-gradient-brand text-white border-0"
                        onClick={() => goCheckout(tier.id, "cartao")}
                      >
                        <CreditCard className="h-4 w-4" /> Cartão
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full rounded-full"
                        onClick={() => goCheckout(tier.id, "pix")}
                      >
                        Pix
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
