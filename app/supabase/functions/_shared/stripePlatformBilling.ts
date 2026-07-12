/**
 * Assinatura Sentinela (plano Start/Pro) via Stripe.
 * Pix do plano continua no Mercado Pago (mpPlatformBilling).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

export type SubscriptionTier = "start" | "pro";

export function getStripeClient() {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY).");
  return new Stripe(key, { apiVersion: "2023-10-16" });
}

export function normalizeSubscriptionTier(tier?: string | null): SubscriptionTier | null {
  const normalized = tier?.trim().toLowerCase();
  if (normalized === "start" || normalized === "39") return "start";
  if (normalized === "pro" || normalized === "49") return "pro";
  return null;
}

export function getStripePriceId(tier: SubscriptionTier): string {
  const envKey = tier === "pro" ? "STRIPE_PRICE_ID_PRO" : "STRIPE_PRICE_ID_START";
  const priceId = Deno.env.get(envKey)?.trim();
  if (!priceId) throw new Error(`${envKey} não configurado.`);
  return priceId;
}

export function stripePeriodEndYmd(subscription: Stripe.Subscription): string {
  const end = subscription.current_period_end;
  if (!end) return new Date().toISOString().slice(0, 10);
  return new Date(end * 1000).toISOString().slice(0, 10);
}

export function stripeCustomerId(subscription: Stripe.Subscription): string | null {
  const customer = subscription.customer;
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export function subscriptionTierFromStripe(subscription: Stripe.Subscription): SubscriptionTier | null {
  return normalizeSubscriptionTier(subscription.metadata?.tier);
}

export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  params: { email: string; shopId: string; displayName: string; existingCustomerId?: string | null },
) {
  if (params.existingCustomerId?.trim()) {
    try {
      return await stripe.customers.retrieve(params.existingCustomerId.trim());
    } catch {
      /* cria novo abaixo */
    }
  }

  return await stripe.customers.create({
    email: params.email.trim(),
    name: params.displayName.trim() || undefined,
    metadata: { shop_id: params.shopId },
  });
}

export async function syncShopFromStripeSubscription(
  supabase: SupabaseClient,
  shopId: string,
  subscription: Stripe.Subscription,
) {
  const tier = subscriptionTierFromStripe(subscription);
  const customerId = stripeCustomerId(subscription);
  const periodEnd = stripePeriodEndYmd(subscription);
  const status = subscription.status;

  const baseUpdate: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    mp_subscription_id: null,
    last_payment_method: "card",
    current_period_end: periodEnd,
    grace_until: null,
  };
  if (customerId) baseUpdate.stripe_customer_id = customerId;
  if (tier) baseUpdate.subscription_tier = tier;

  if (status === "active" || status === "trialing") {
    const cancelledAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    await supabase
      .from("barbershops")
      .update({
        ...baseUpdate,
        subscription_status: cancelledAtPeriodEnd ? "cancelled" : "active",
        subscription_notice: cancelledAtPeriodEnd
          ? "Assinatura cancelada. O acesso continua até o fim do período já pago."
          : null,
      })
      .eq("id", shopId);
    return;
  }

  if (status === "canceled" || status === "unpaid") {
    await supabase
      .from("barbershops")
      .update({
        ...baseUpdate,
        subscription_status: "cancelled",
        subscription_notice: "Assinatura encerrada na Stripe. Você pode assinar novamente em Conta.",
      })
      .eq("id", shopId);
    return;
  }

  if (status === "past_due") {
    await supabase
      .from("barbershops")
      .update({
        ...baseUpdate,
        subscription_status: "grace",
        subscription_notice: "Pagamento pendente. Atualize o cartão em Conta para manter o acesso.",
      })
      .eq("id", shopId);
    return;
  }

  if (status === "incomplete" || status === "incomplete_expired") {
    await supabase
      .from("barbershops")
      .update({
        subscription_notice: "Pagamento não concluído. Tente assinar novamente em Conta.",
      })
      .eq("id", shopId);
  }
}

export async function findShopIdForStripeSubscription(
  supabase: SupabaseClient,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = subscription.metadata?.shop_id?.trim();
  if (fromMeta) return fromMeta;

  const subId = subscription.id;
  const { data: bySub } = await supabase
    .from("barbershops")
    .select("id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (bySub?.id) return bySub.id;

  const customerId = stripeCustomerId(subscription);
  if (!customerId) return null;

  const { data: byCustomer } = await supabase
    .from("barbershops")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return byCustomer?.id ?? null;
}

export function paymentIntentClientSecret(subscription: Stripe.Subscription): string | null {
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === "string") return null;
  const paymentIntent = invoice.payment_intent;
  if (!paymentIntent || typeof paymentIntent === "string") return null;
  return paymentIntent.client_secret ?? null;
}
