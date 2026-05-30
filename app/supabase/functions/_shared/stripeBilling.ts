import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) {
    throw new Error("Stripe não configurado (STRIPE_SECRET_KEY).");
  }
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export function getStripePriceId(): string {
  const priceId = Deno.env.get("STRIPE_PRICE_ID")?.trim();
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID não configurado.");
  }
  return priceId;
}

export function periodEndFromStripe(subscription: Stripe.Subscription): string | null {
  const end = subscription.current_period_end;
  if (!end) return null;
  return new Date(end * 1000).toISOString().slice(0, 10);
}

function graceUntilIso(days = 3): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Converte status Stripe → subscription_status do Sentinela. */
export function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "grace";
    case "canceled":
      return "cancelled";
    case "unpaid":
    case "incomplete_expired":
      return "expired";
    case "incomplete":
    case "paused":
      return "pending_payment";
    default:
      return "expired";
  }
}

/** Persiste no banco o estado vindo da Stripe. */
export async function applyStripeSubscriptionToShop(
  supabase: SupabaseClient,
  shopId: string,
  subscription: Stripe.Subscription,
) {
  const mapped = mapStripeSubscriptionStatus(subscription.status);
  const periodEnd = periodEndFromStripe(subscription);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;

  if (mapped === "active") {
    await supabase
      .from("barbershops")
      .update({
        subscription_status: "active",
        stripe_subscription_id: subscription.id,
        current_period_end: periodEnd,
        grace_until: null,
        subscription_notice: cancelAtPeriodEnd
          ? "Assinatura cancelada. O acesso continua até o fim do período já pago."
          : null,
      })
      .eq("id", shopId);
    return "active";
  }

  if (mapped === "grace") {
    await supabase
      .from("barbershops")
      .update({
        subscription_status: "grace",
        stripe_subscription_id: subscription.id,
        grace_until: graceUntilIso(),
        subscription_notice:
          "Pagamento do cartão pendente. Regularize em até 3 dias para não bloquear novos agendamentos.",
      })
      .eq("id", shopId);
    return "grace";
  }

  if (mapped === "cancelled") {
    await supabase
      .from("barbershops")
      .update({
        subscription_status: "cancelled",
        stripe_subscription_id: subscription.id,
        current_period_end: periodEnd,
        subscription_notice: "Assinatura cancelada. O acesso continua até o fim do período já pago.",
      })
      .eq("id", shopId);
    return "cancelled";
  }

  if (mapped === "expired") {
    await supabase
      .from("barbershops")
      .update({
        subscription_status: "expired",
        subscription_notice: "Assinatura inativa. Assine novamente em Conta para liberar agendamentos.",
      })
      .eq("id", shopId);
    return "expired";
  }

  if (mapped === "pending_payment") {
    await supabase
      .from("barbershops")
      .update({
        stripe_subscription_id: subscription.id,
      })
      .eq("id", shop.id);
    return "pending_payment";
  }

  return mapped;
}

export async function findShopByStripeSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
  customerId?: string | null,
) {
  const { data: bySub } = await supabase
    .from("barbershops")
    .select("id, owner_id, stripe_customer_id, stripe_subscription_id, current_period_end")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (bySub) return bySub;

  if (customerId) {
    const { data: byCustomer } = await supabase
      .from("barbershops")
      .select("id, owner_id, stripe_customer_id, stripe_subscription_id, current_period_end")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (byCustomer) return byCustomer;
  }

  return null;
}
