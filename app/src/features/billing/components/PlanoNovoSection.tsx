import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import type { SubscriptionInfo } from "@/hooks/useSubscription";
import { PLAN_TIERS, planTierLabel, type PlanTier, type PlanTierDefinition } from "@/lib/planTiers";
import { cancelStripeSubscription, syncStripeSubscription } from "@/lib/subscriptionPlanApi";
import { accountUsesExternalPlan, formatPlanStatusHeading, isPlanCancelledWithAccess } from "@/lib/subscriptionMessages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function formatDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function isPlanPeriodStillValid(info: SubscriptionInfo | null) {
  if (!info?.current_period_end) return true;
  const [y, m, d] = info.current_period_end.split("-").map(Number);
  if (!y || !m || !d) return true;
  const end = new Date(y, m - 1, d);
  end.setHours(23, 59, 59, 999);
  return end >= new Date();
}

function hasPaidPlanAccess(info: SubscriptionInfo | null) {
  const tier = info?.subscription_tier;
  if (tier !== "start" && tier !== "pro") return false;
  if (info?.subscription_status !== "active" && info?.subscription_status !== "cancelled") return false;
  return isPlanPeriodStillValid(info);
}

function formatActivePlanPeriodEnd(info: SubscriptionInfo | null) {
  if (isPlanCancelledWithAccess(info)) return null;

  const date = formatDateBr(info?.current_period_end);
  if (!date || date === "—") return null;

  const paidWithPix =
    info?.subscription_status === "active" &&
    info?.last_payment_method === "pix" &&
    (info?.subscription_tier === "start" || info?.subscription_tier === "pro");

  const paidWithCard =
    info?.subscription_status === "active" &&
    info?.last_payment_method === "card" &&
    (info?.subscription_tier === "start" || info?.subscription_tier === "pro");

  if (paidWithPix) return `${date} — você pagou com Pix`;
  if (paidWithCard) return `${date} — renovação automática no cartão`;
  return date;
}

type Props = {
  info: SubscriptionInfo | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  highlightPro?: boolean;
  onDismissProHighlight?: () => void;
};

function PlanTierCard({
  tier,
  highlighted,
  cardRef,
  showActions,
  onCheckout,
}: {
  tier: PlanTierDefinition;
  highlighted?: boolean;
  cardRef?: RefObject<HTMLDivElement | null>;
  showActions: boolean;
  onCheckout: (tier: PlanTier, method: "cartao" | "pix") => void;
}) {
  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-xl border border-border p-4 flex flex-col gap-3 transition-all duration-300",
        highlighted &&
          "relative z-10 mt-2 border-[hsl(var(--brand-green))] bg-[hsl(var(--brand-green))]/[0.07] ring-[3px] ring-[hsl(var(--brand-green))] ring-offset-4 ring-offset-background shadow-[0_0_28px_-6px_hsl(var(--brand-green)/0.5)]",
      )}
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-[hsl(var(--brand-green))] px-3 py-0.5 text-[11px] font-semibold text-white shadow-md">
          Assine este plano
        </span>
      )}
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
      {showActions && (
        <div className="space-y-2 pt-1">
          <Button
            className="w-full rounded-full bg-gradient-brand text-white border-0"
            onClick={() => onCheckout(tier.id, "cartao")}
          >
            <CreditCard className="h-4 w-4" /> Cartão
          </Button>
          <Button variant="outline" className="w-full rounded-full" onClick={() => onCheckout(tier.id, "pix")}>
            Pix
          </Button>
        </div>
      )}
    </div>
  );
}

export function PlanoNovoSection({ info, loading, onRefresh, highlightPro = false, onDismissProHighlight }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [cancelling, setCancelling] = useState(false);
  const proCardRef = useRef<HTMLDivElement>(null);
  const periodSyncAttemptedRef = useRef(false);

  const usesExternalPlan = accountUsesExternalPlan(info);
  const hasActivePlan = hasPaidPlanAccess(info);
  const isCancelledWithAccess = isPlanCancelledWithAccess(info);
  const isRecurringActive = info?.subscription_status === "active" && !isCancelledWithAccess;
  const activeTier = (info?.subscription_tier as PlanTier | null | undefined) ?? null;
  const canCancel =
    !info?.is_admin &&
    !usesExternalPlan &&
    isRecurringActive &&
    info?.last_payment_method === "card" &&
    Boolean(info?.stripe_subscription_id?.trim());
  const proTier = PLAN_TIERS.find((tier) => tier.id === "pro");
  const activePlanPeriodEndLabel = formatActivePlanPeriodEnd(info);

  function canSubscribeTier(tier: PlanTier) {
    if (info?.is_admin || usesExternalPlan || loading) return false;
    if (!hasActivePlan) return true;
    return isRecurringActive && activeTier === "start" && tier === "pro";
  }

  useEffect(() => {
    if (loading || periodSyncAttemptedRef.current) return;
    if (!info?.stripe_subscription_id?.trim()) return;
    if (info.current_period_end) return;
    if (!isCancelledWithAccess) return;

    periodSyncAttemptedRef.current = true;
    void syncStripeSubscription(info.stripe_subscription_id)
      .then(() => onRefresh())
      .catch(() => {
        periodSyncAttemptedRef.current = false;
      });
  }, [loading, info, isCancelledWithAccess, onRefresh]);

  useEffect(() => {
    if (!highlightPro || loading) return;

    const frame = window.requestAnimationFrame(() => {
      proCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightPro, loading, hasActivePlan, activeTier]);

  useEffect(() => {
    if (!highlightPro || !onDismissProHighlight || location.pathname !== "/app/perfil") return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (proCardRef.current?.contains(target)) return;
      onDismissProHighlight();
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [highlightPro, onDismissProHighlight, location.pathname]);

  async function handleCancel() {
    if (!confirm("Cancelar a assinatura? Você mantém o acesso até o fim do período já pago.")) return;
    setCancelling(true);
    try {
      const data = await cancelStripeSubscription();
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
    onDismissProHighlight?.();
    navigate(`/app/perfil/assinar-plano/${method}?tier=${tier}`);
  }

  if (usesExternalPlan) return null;
  if (!proTier) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Plano
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando planos…</p>
        ) : hasActivePlan && activeTier === "pro" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[hsl(var(--brand-green))]/30 bg-[hsl(var(--brand-green))]/10 px-4 py-3 text-sm">
              <p className="font-semibold">{formatPlanStatusHeading(info, planTierLabel(activeTier))}</p>
              {activePlanPeriodEndLabel && (
                <p className="text-muted-foreground mt-1">Vencimento: {activePlanPeriodEndLabel}</p>
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
        ) : hasActivePlan && activeTier === "start" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
              <p className="font-semibold">{formatPlanStatusHeading(info, planTierLabel(activeTier))}</p>
              {activePlanPeriodEndLabel && (
                <p className="text-muted-foreground mt-1">Vencimento: {activePlanPeriodEndLabel}</p>
              )}
            </div>
            <PlanTierCard
              tier={proTier}
              highlighted={highlightPro}
              cardRef={proCardRef}
              showActions={canSubscribeTier("pro")}
              onCheckout={goCheckout}
            />
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
              14 dias grátis no Sentinela. Pix ativa o plano na hora; cartão renova automaticamente todo mês.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PLAN_TIERS.map((tier) => (
                <PlanTierCard
                  key={tier.id}
                  tier={tier}
                  highlighted={highlightPro && tier.id === "pro"}
                  cardRef={tier.id === "pro" ? proCardRef : undefined}
                  showActions={canSubscribeTier(tier.id)}
                  onCheckout={goCheckout}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
