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

export async function invokePublicPaymentFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!SUPABASE_FUNCTIONS_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase não configurado.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await readFunctionPayload(response);
    if (!response.ok) {
      throw new Error(payload?.error ?? payload?.message ?? "Não foi possível iniciar o pagamento.");
    }
    return payload as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Tempo esgotado ao preparar o pagamento. Tente novamente.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export type InstallmentCheckoutConfig = {
  pass_fee_to_client?: boolean;
  max_count?: number | null;
  surcharge_rates?: Record<string, number>;
  enabled?: boolean;
};

export type AppointmentPaymentCheckout = {
  client_secret: string;
  payment_intent_id: string;
  amount_centavos: number;
  valor_base_centavos?: number;
  installment_count?: number;
  expires_at: string | null;
  stripe_connect_account_id?: string;
  installment?: InstallmentCheckoutConfig | null;
};

export async function createAppointmentPaymentCheckout(input: {
  agendamento_id: string;
  confirmation_token: string;
  installment_count?: number;
}): Promise<AppointmentPaymentCheckout> {
  return invokePublicPaymentFunction("stripe-create-appointment-payment", {
    agendamento_id: input.agendamento_id,
    confirmation_token: input.confirmation_token,
    installment_count: input.installment_count ?? 1,
  });
}

export async function verifyAppointmentPayment(input: {
  agendamento_id: string;
  confirmation_token: string;
}): Promise<{ ok?: boolean; status?: string; payment_intent_status?: string; awaiting_pix?: boolean }> {
  return invokePublicPaymentFunction("stripe-verify-appointment-payment", input);
}

export const STRIPE_PUBLISHABLE_KEY = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
