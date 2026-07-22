import { supabase } from "@/integrations/supabase/client";

export type AppointmentPaymentMode = "none" | "deposit" | "full";
export type AppointmentDepositType = "percent" | "fixed";

export type PaymentPanelSettings = {
  error?: string;
  message?: string;
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
  appointment_payment_mode?: AppointmentPaymentMode;
  appointment_deposit_type?: AppointmentDepositType | null;
  appointment_deposit_value?: number | null;
  payment_enable_card?: boolean;
  payment_enable_pix?: boolean;
  payment_pass_fee_card?: boolean;
  payment_pass_fee_pix?: boolean;
  payment_max_installments?: number | null;
  has_priced_services?: boolean;
  can_enable_payment?: boolean;
  mp_managed_by_titular?: boolean;
  can_connect_mp?: boolean;
};

export type SavePaymentPanelSettingsInput = {
  payments_centralized?: boolean;
  appointment_payment_mode?: AppointmentPaymentMode;
  appointment_deposit_type?: AppointmentDepositType | null;
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

export async function savePaymentPanelSettings(
  input: SavePaymentPanelSettingsInput,
): Promise<PaymentPanelSettings> {
  const { data, error } = await supabase.rpc("update_payment_panel_settings", {
    p_payments_centralized: input.payments_centralized ?? null,
    p_appointment_payment_mode: input.appointment_payment_mode ?? null,
    p_appointment_deposit_type: input.appointment_deposit_type ?? null,
    p_appointment_deposit_value: input.appointment_deposit_value ?? null,
    p_payment_enable_card: input.payment_enable_card ?? null,
    p_payment_enable_pix: input.payment_enable_pix ?? null,
    p_payment_pass_fee_card: input.payment_pass_fee_card ?? null,
    p_payment_pass_fee_pix: input.payment_pass_fee_pix ?? null,
    p_payment_max_installments: input.payment_max_installments ?? null,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as PaymentPanelSettings;
  if (result.error) throw new Error(result.message ?? result.error);
  return result;
}

export async function disconnectMpAccount(): Promise<PaymentPanelSettings> {
  const { data, error } = await supabase.rpc("disconnect_mp_account");
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as PaymentPanelSettings;
  if (result.error) throw new Error(result.message ?? result.error);
  return result;
}

export async function startMpOAuth(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("mp-oauth-start", { body: {} });
  if (error) throw new Error(error.message);
  const payload = data as { url?: string; error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.url) throw new Error("Mercado Pago não retornou URL de autorização.");
  return { url: payload.url };
}

export function paymentModeLabel(mode: string | undefined) {
  switch (mode) {
    case "deposit":
      return "Sinal (parte do valor)";
    case "full":
      return "Pagamento integral";
    default:
      return "Sem cobrança no link público";
  }
}

export function formatDepositFixedReais(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export function parseDepositFixedReais(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const reais = Number.parseFloat(normalized);
  if (!Number.isFinite(reais) || reais <= 0) return 0;
  return Math.round(reais * 100);
}
