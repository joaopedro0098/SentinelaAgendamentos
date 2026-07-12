import { invokeBillingFunction } from "@/lib/billingApi";
import type { PlanTier } from "@/lib/planTiers";

export type PlanPixCreateResponse = {
  ok?: boolean;
  payment_id?: string;
  qr_code?: string;
  qr_code_base64?: string | null;
  tier?: PlanTier;
  amount?: number;
  error?: string;
};

export type PlanPixVerifyResponse = {
  ok?: boolean;
  payment_status?: string;
  activated?: boolean;
  subscription?: Record<string, unknown>;
  error?: string;
};

export type StripeCreateSubscriptionResponse = {
  ok?: boolean;
  client_secret?: string | null;
  subscription_id?: string;
  customer_id?: string;
  upgraded?: boolean;
  activated?: boolean;
  reactivated?: boolean;
  error?: string;
};

export type StripeSyncSubscriptionResponse = {
  ok?: boolean;
  activated?: boolean;
  subscription_status?: string;
  subscription?: Record<string, unknown>;
  error?: string;
};

export type CancelStripeSubscriptionResponse = {
  ok?: boolean;
  subscription_status?: string;
  current_period_end?: string | null;
  subscription?: Record<string, unknown>;
  error?: string;
};

export function createStripeSubscription(tier: PlanTier) {
  return invokeBillingFunction<StripeCreateSubscriptionResponse>("stripe-create-subscription", { tier });
}

export function syncStripeSubscription(subscriptionId?: string | null) {
  return invokeBillingFunction<StripeSyncSubscriptionResponse>("stripe-sync-subscription", {
    subscription_id: subscriptionId ?? undefined,
  });
}

export function cancelStripeSubscription() {
  return invokeBillingFunction<CancelStripeSubscriptionResponse>("stripe-cancel-subscription");
}

export function createSubscriptionPlanPix(tier: PlanTier) {
  return invokeBillingFunction<PlanPixCreateResponse>("mp-create-subscription-plan-pix", { tier });
}

export function verifySubscriptionPlanPix(tier: PlanTier, paymentId?: string | null) {
  return invokeBillingFunction<PlanPixVerifyResponse>("mp-verify-subscription-plan-pix", {
    tier,
    payment_id: paymentId ?? undefined,
  });
}
