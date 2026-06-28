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

  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readFunctionPayload(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "Não foi possível iniciar o pagamento.");
  }
  return payload as T;
}

export type AppointmentPaymentCheckout = {
  client_secret: string;
  payment_intent_id: string;
  amount_centavos: number;
  expires_at: string | null;
};

export async function createAppointmentPaymentCheckout(input: {
  agendamento_id: string;
  confirmation_token: string;
}): Promise<AppointmentPaymentCheckout> {
  return invokePublicPaymentFunction("stripe-create-appointment-payment", input);
}

export async function verifyAppointmentPayment(input: {
  agendamento_id: string;
  confirmation_token: string;
}): Promise<{ ok?: boolean; status?: string }> {
  return invokePublicPaymentFunction("stripe-verify-appointment-payment", input);
}

export const STRIPE_PUBLISHABLE_KEY = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim();
