import { useEffect, useRef, useState, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import type { SubscriptionInfo } from "@/hooks/useSubscription";
import { PLAN_TIERS, planTierLabel, type PlanTier, type PlanTierDefinition } from "@/lib/planTiers";
import { cancelMpPreapproval } from "@/lib/subscriptionPlanApi";
import { accountUsesExternalPlan } from "@/lib/subscriptionMessages";
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

function formatActivePlanPeriodEnd(info: SubscriptionInfo | null) {
  const date = formatDateBr(info?.current_period_end);
  if (!date || date === "—") return null;

  const paidWithPix =
    info?.subscription_status === "active" &&
    info?.last_payment_method === "pix" &&
    (info?.subscription_tier === "start" || info?.subscription_tier === "pro");

  if (paidWithPix) return `${date} — você pagou com Pix`;
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

  const usesExternalPlan = accountUsesExternalPlan(info);
  const isActive = info?.subscription_status === "active";
  const activeTier = (info?.subscription_tier as PlanTier | null | undefined) ?? null;
  const canCancel =
    !info?.is_admin &&
    !usesExternalPlan &&
    isActive &&
    info?.last_payment_method === "mp_sub" &&
    Boolean(info?.mp_subscription_id?.trim());
  const proTier = PLAN_TIERS.find((tier) => tier.id === "pro");
  const activePlanPeriodEndLabel = formatActivePlanPeriodEnd(info);

  function canSubscribeTier(tier: PlanTier) {
    if (info?.is_admin || usesExternalPlan || loading) return false;
    if (!isActive) return true;
    return activeTier === "start" && tier === "pro";
  }

  useEffect(() => {
    if (!highlightPro || loading) return;

    const frame = window.requestAnimationFrame(() => {
      proCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightPro, loading, isActive, activeTier]);

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
    onDismissProHighlight?.();
    navigate(`/app/perfil/assinar-plano/${method}?tier=${tier}`);
  }

  if (usesExternalPlan) return null;
  if (!proTier) return null;

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
        ) : isActive && activeTier === "pro" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[hsl(var(--brand-green))]/30 bg-[hsl(var(--brand-green))]/10 px-4 py-3 text-sm">
              <p className="font-semibold">Plano {planTierLabel(activeTier)} ativo</p>
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
        ) : isActive && activeTier === "start" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
              <p className="font-semibold">Plano Start ativo</p>
              {activePlanPeriodEndLabel && (
                <p className="text-muted-foreground mt-1">Vencimento: {activePlanPeriodEndLabel}</p>
              )}
              <p className="text-muted-foreground mt-1 text-xs">
                Faça upgrade para o Pro para cobrar no link público.
              </p>
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
              14 dias grátis no cartão (Mercado Pago). Pix ativa o plano na hora após o pagamento.
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
