import { invokeBillingFunction } from "@/lib/billingApi";
import type { PlanTier } from "@/lib/planTiers";

export type PreapprovalCardResponse = {
  ok?: boolean;
  preapproval_id?: string;
  ui_status?: "approved" | "pending" | "error";
  mp_status?: string | null;
  error?: string;
  retry?: boolean;
};

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

export type CancelPreapprovalResponse = {
  ok?: boolean;
  subscription_status?: string;
  current_period_end?: string | null;
  subscription?: Record<string, unknown>;
  error?: string;
};

export function createPreapprovalCard(tier: PlanTier, formData: Record<string, unknown>) {
  return invokeBillingFunction<PreapprovalCardResponse>("mp-create-preapproval-card", { tier, formData });
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

export function cancelMpPreapproval() {
  return invokeBillingFunction<CancelPreapprovalResponse>("mp-cancel-preapproval");
}
