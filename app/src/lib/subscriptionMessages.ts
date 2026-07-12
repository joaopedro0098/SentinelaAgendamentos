import { toast } from "sonner";
import type { SubscriptionInfo } from "@/hooks/useSubscription";
import type { PlanTier } from "@/lib/planTiers";

export const FACIAL_TRIAL_BLOCKED_MESSAGE =
  "Identificamos um cadastro anterior associado a esta biometria facial. Para fazer novos agendamentos, assine o plano.";

const SUBSCRIPTION_BLOCK_OWNER = "Renove a assinatura para agendar.";

const OWNER_BOOKING_BLOCK_SIGNUP = "Assine para liberar novos agendamentos.";

const SUBSCRIPTION_NOTICE_EXPIRED =
  "Assine novamente em Conta para liberar agendamentos.";

const AGGREGATED_BOOKING_BLOCK_MESSAGE =
  "Assinatura do titular inativa. Contate-o para realizar a renovação";

const LEGACY_SUBSCRIPTION_NOTICE_EXPIRED =
  "Assinatura inativa. Assine novamente em Conta para liberar agendamentos.";

/** Avisos de checkout iniciado mas não concluído (Pix/cartão MP). */
const CHECKOUT_PENDING_NOTICE_PREFIXES = [
  "Pague o Pix do plano",
  "Finalize o pagamento Pix",
  "Finalize a assinatura no Mercado Pago",
  "Finalize o pagamento no Mercado Pago",
  "Estamos confirmando sua assinatura",
] as const;

function isCheckoutPendingNotice(notice: string): boolean {
  return CHECKOUT_PENDING_NOTICE_PREFIXES.some((prefix) => notice.startsWith(prefix));
}

function isPlanPeriodStillValid(info: SubscriptionInfo) {
  if (!info.current_period_end) return true;
  const [y, m, d] = info.current_period_end.split("-").map(Number);
  if (!y || !m || !d) return true;
  const end = new Date(y, m - 1, d);
  end.setHours(23, 59, 59, 999);
  return end >= new Date();
}

/** Aviso de assinatura cancelada com acesso até o fim do período pago. */
export function isSubscriptionCancelledNotice(notice: string | null | undefined) {
  const normalized = (notice ?? "").toLowerCase();
  return normalized.includes("assinatura cancelada");
}

/** Plano cancelado (cartão/Pix) mas ainda dentro do período já pago. */
export function isPlanCancelledWithAccess(info: SubscriptionInfo | null | undefined) {
  if (!info) return false;

  const cancelled =
    info.subscription_status === "cancelled" || isSubscriptionCancelledNotice(info.subscription_notice);
  if (!cancelled) return false;

  if (!info.current_period_end) return info.can_book !== false;
  return isPlanPeriodStillValid(info);
}

export function formatPlanStatusHeading(info: SubscriptionInfo | null | undefined, tierName: string) {
  const periodEnd = formatSubscriptionDateBr(info?.current_period_end);

  if (isPlanCancelledWithAccess(info)) {
    return periodEnd ? `Plano ${tierName} válido até ${periodEnd}` : `Plano ${tierName} válido`;
  }

  return `Plano ${tierName} ativo`;
}

export function formatSubscriptionDateBr(iso: string | null | undefined) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

/** Cartão Stripe: mesmo plano cancelado (período ainda válido) → pedir confirmação antes de reativar. */
export function shouldOfferStripeReactivationConfirm(
  info: SubscriptionInfo | null | undefined,
  tier: PlanTier,
) {
  if (!info) return false;
  if (!isPlanCancelledWithAccess(info)) return false;
  if (info.last_payment_method !== "card") return false;
  if (!info.stripe_subscription_id?.trim()) return false;
  return info.subscription_tier === tier;
}

export function formatSubscriptionNotice(notice: string | null | undefined): string | null {
  if (!notice) return null;
  if (notice === LEGACY_SUBSCRIPTION_NOTICE_EXPIRED) return SUBSCRIPTION_NOTICE_EXPIRED;
  if (notice.startsWith("Assinatura inativa. ")) {
    return notice.slice("Assinatura inativa. ".length);
  }
  return notice;
}

/** Exibe aviso na Conta; oculta lembretes de Pix/checkout abandonado quando a assinatura não está ativa. */
export function shouldShowSubscriptionNotice(
  info: SubscriptionInfo | null | undefined,
  notice: string | null | undefined,
): boolean {
  const formatted = formatSubscriptionNotice(notice);
  if (!formatted || accountUsesExternalPlan(info) || !info) return false;
  if (isCheckoutPendingNotice(formatted) && !info.can_book) return false;
  return true;
}

/** CA/AA/admin agregado: não exibir avisos de assinatura própria do CT. */
export function accountUsesExternalPlan(info: SubscriptionInfo | null | undefined): boolean {
  if (!info || info.is_admin) return true;
  if (info.is_admin_aggregated) return true;
  if (info.account_type === "aa" || info.account_type === "ca") return true;
  return Boolean(info.is_aggregated_account);
}

export function getOwnerBookingBlockMessage(info: SubscriptionInfo): string {
  if (info.is_aggregated_account && !info.can_book) {
    return AGGREGATED_BOOKING_BLOCK_MESSAGE;
  }
  if (info.facial_trial_used) return FACIAL_TRIAL_BLOCKED_MESSAGE;
  if (info.trial_already_used) {
    return OWNER_BOOKING_BLOCK_SIGNUP;
  }
  if (info.subscription_status === "grace") {
    return "Pagamento pendente. Regularize em até a data de tolerância para continuar agendando.";
  }
  if (info.subscription_status === "trial") {
    return "Seu teste grátis terminou. Assine para liberar novos agendamentos.";
  }
  return SUBSCRIPTION_BLOCK_OWNER;
}

export function showOwnerBookingBlockedToast(message: string) {
  toast.error(message, {
    position: "top-center",
    duration: 7000,
    classNames: {
      toast: "!bg-red-600 !text-white !border-red-700 shadow-lg !rounded-xl px-4 py-3",
      title: "!text-white !text-base !font-semibold !leading-snug",
    },
  });
}
