import { supabase } from "@/integrations/supabase/client";

export type PaymentPanelSettings = {
  error?: string;
  role?: "ca" | "ct" | "owner";
  ca_readonly?: boolean;
  readonly_message?: string;
  shop_id?: string;
  payments_centralized?: boolean;
  can_edit_centralization?: boolean;
  mp_connect_status?: string;
  mp_connected?: boolean;
  mp_live_mode?: boolean | null;
  mp_user_id?: number | null;
  appointment_payment_mode?: string;
  appointment_deposit_type?: string | null;
  appointment_deposit_value?: number | null;
  payment_enable_card?: boolean;
  payment_enable_pix?: boolean;
  payment_pass_fee_card?: boolean;
  payment_pass_fee_pix?: boolean;
  payment_max_installments?: number | null;
};

export async function fetchPaymentPanelSettings(): Promise<PaymentPanelSettings> {
  const { data, error } = await supabase.rpc("get_payment_panel_settings");
  if (error) throw new Error(error.message);
  return (data ?? {}) as PaymentPanelSettings;
}

export async function savePaymentPanelSettings(input: {
  payments_centralized?: boolean;
}): Promise<PaymentPanelSettings> {
  const { data, error } = await supabase.rpc("update_payment_panel_settings", {
    p_payments_centralized: input.payments_centralized ?? null,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as PaymentPanelSettings;
  if (result.error) throw new Error(result.message ?? result.error);
  return result;
}

export async function disconnectMpAccount(): Promise<PaymentPanelSettings> {
  const { data, error } = await supabase.rpc("disconnect_mp_account");
  if (error) throw new Error(error.message);
  return (data ?? {}) as PaymentPanelSettings;
}

export async function startMpOAuth(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("mp-oauth-start", { body: {} });
  if (error) throw new Error(error.message);
  const payload = data as { url?: string; error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.url) throw new Error("Mercado Pago não retornou URL de autorização.");
  return { url: payload.url };
}

export const MP_PUBLIC_KEY = String(import.meta.env.VITE_MP_PUBLIC_KEY ?? "").trim();
