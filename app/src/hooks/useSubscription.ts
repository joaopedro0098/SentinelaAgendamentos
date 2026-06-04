import { useSubscriptionContext } from "@/providers/SubscriptionProvider";

export type SubscriptionInfo = {
  is_admin: boolean;
  can_book: boolean;
  subscription_status: string;
  trial_days_left?: number;
  trial_last_day?: string;
  current_period_end?: string | null;
  grace_until?: string | null;
  subscription_notice?: string | null;
  trial_already_used?: boolean;
  facial_trial_used?: boolean;
  plan_price_label?: string;
  label?: string;
  mp_subscription_id?: string | null;
  stripe_subscription_id?: string | null;
  is_aggregated_account?: boolean;
  aggregated_by_email?: string | null;
  can_manage_aggregated_accounts?: boolean;
};

export function useSubscription() {
  return useSubscriptionContext();
}
