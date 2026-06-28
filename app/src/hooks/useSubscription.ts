import { useSubscriptionContext } from "@/providers/SubscriptionProvider";

export type AccountType = "admin" | "ct" | "ca" | "aa";

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
  /** Tipo da conta: 'admin' | 'ct' | 'ca' | 'aa' */
  account_type?: AccountType;
  /** CT e AA podem gerenciar suas CAs; CA e admin (via aba admin) não usam este fluxo. */
  can_manage_aggregated_accounts?: boolean;
  /** CA agregada: perfil e link herdados do titular (CT/AA). */
  owner_slug?: string | null;
  owner_display_name?: string | null;
  owner_avatar_url?: string | null;
  owner_contact_phone?: string | null;
  owner_public_booking_enabled?: boolean;
  /** CA: titular (CT/AA) pode ver agendamentos desta conta. */
  owner_can_view_appointments?: boolean;
  /** CA: titular (CT/AA) pode editar agendamentos desta conta. */
  owner_can_edit_appointments?: boolean;
  /** CA: titular (CT/AA) pode ver anotações/pacientes desta conta. */
  owner_can_view_annotations?: boolean;
  /** AA: isenta de assinatura (agregada pelo admin da plataforma). */
  is_admin_aggregated?: boolean;
  /** CT/AA: existe CA ativa que permite edição/criação de agendamentos pelo titular. */
  titular_has_editable_ca_appointments?: boolean;
};

export function useSubscription() {
  return useSubscriptionContext();
}
