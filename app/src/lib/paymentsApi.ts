import { supabase } from "@/integrations/supabase/client";

const SUPABASE_FUNCTIONS_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
).trim();

async function readFunctionPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as { error?: string; message?: string; [key: string]: unknown };
  } catch {
    return { message: text };
  }
}

export async function invokePaymentsFunction<T>(
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Faça login novamente para continuar.");
  if (!SUPABASE_FUNCTIONS_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase não configurado no app.");
  }

  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      ...(typeof window !== "undefined" ? { return_origin: window.location.origin } : {}),
    }),
  });

  const payload = await readFunctionPayload(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "Edge Function retornou erro.");
  }
  return payload as T;
}

export type PaymentPanelSettings = {
  role?: string;
  shop_id?: string;
  barbearia_id?: string;
  payments_centralized?: boolean;
  can_edit_centralization?: boolean;
  stripe_connect_account_id?: string | null;
  stripe_connect_status?: string;
  stripe_connect_email?: string | null;
  appointment_payment_mode?: string;
  appointment_deposit_type?: string | null;
  appointment_deposit_value?: number | null;
  all_services_have_prices?: boolean;
  can_enable_payment?: boolean;
  message?: string;
  error?: string;
};

export async function fetchPaymentPanelSettings(): Promise<PaymentPanelSettings> {
  const { data, error } = await supabase.rpc("get_payment_panel_settings");
  if (error) throw new Error(error.message);
  return (data ?? {}) as PaymentPanelSettings;
}

export async function savePaymentPanelSettings(input: {
  payments_centralized?: boolean;
  appointment_payment_mode?: string;
  appointment_deposit_type?: string | null;
  appointment_deposit_value?: number | null;
}): Promise<PaymentPanelSettings> {
  const { data, error } = await supabase.rpc("update_payment_panel_settings", {
    p_payments_centralized: input.payments_centralized ?? null,
    p_appointment_payment_mode: input.appointment_payment_mode ?? null,
    p_appointment_deposit_type: input.appointment_deposit_type ?? null,
    p_appointment_deposit_value: input.appointment_deposit_value ?? null,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as PaymentPanelSettings;
  if (result.error) {
    throw new Error(result.message ?? result.error);
  }
  return result;
}

export const STRIPE_PUBLISHABLE_KEY = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();

export function isStripePublishableTestMode() {
  return STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_");
}

/** Localhost: mostra seed de teste em dev; produção só com pk_test_. */
export function showConnectTestSeedUi() {
  return isStripePublishableTestMode() || import.meta.env.DEV;
}
