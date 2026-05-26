import { toast } from "sonner";
import type { SubscriptionInfo } from "@/hooks/useSubscription";

export const FACIAL_TRIAL_BLOCKED_MESSAGE =
  "Identificamos um cadastro anterior associado a esta biometria facial. Para fazer novos agendamentos, assine o plano.";

export const SUBSCRIPTION_BLOCK_OWNER = "Renove a assinatura para agendar.";

export function getClientBookingBlockMessage(profileName: string | undefined): string {
  const name = profileName?.trim() || "o estabelecimento";
  return `Sistema bloqueado, entre em contato com ${name} por WhatsApp para que eles realizem o desbloqueio.`;
}

/** @deprecated Use getClientBookingBlockMessage */
export function getSubscriptionBlockClient(shopName: string | undefined): string {
  return getClientBookingBlockMessage(shopName);
}

export function getOwnerBookingBlockMessage(info: SubscriptionInfo): string {
  if (info.facial_trial_used) return FACIAL_TRIAL_BLOCKED_MESSAGE;
  if (info.trial_already_used) {
    return "Este e-mail já utilizou o teste grátis. Assine para liberar novos agendamentos.";
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

export function isSubscriptionBlockError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("função bloqueada") ||
    m.includes("pagamento da mensalidade") ||
    m.includes("row-level security") ||
    m.includes("barbearia_pode_agendar")
  );
}
