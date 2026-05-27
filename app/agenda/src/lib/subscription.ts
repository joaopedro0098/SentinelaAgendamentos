import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const SUBSCRIPTION_BLOCK_OWNER = "Renove a assinatura para agendar.";

const BOOKING_BLOCKED_TOAST_MS = 10_000;

export function getClientBookingBlockMessage(profileName: string | undefined): string {
  const name = profileName?.trim() || "o estabelecimento";
  return `Sistema bloqueado, entre em contato com ${name} por WhatsApp para que eles realizem o desbloqueio.`;
}

export function showClientBookingBlockedToast(message: string) {
  toast.error(message, {
    position: "top-center",
    duration: BOOKING_BLOCKED_TOAST_MS,
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
    m.includes("row-level security")
  );
}

export async function checkBarbeariaCanBook(barbeariaId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_barbearia_pode_agendar", {
    p_barbearia_id: barbeariaId,
  });
  if (error) return false;
  return Boolean(data);
}
