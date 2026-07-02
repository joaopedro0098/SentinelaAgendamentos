const SUPABASE_FUNCTIONS_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
).trim();

async function readFunctionPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as {
      error?: string;
      message?: string;
      retry?: boolean;
      release_hold?: boolean;
      [key: string]: unknown;
    };
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
    const err = new Error(payload?.error ?? payload?.message ?? "Não foi possível iniciar o pagamento.") as Error & {
      retry?: boolean;
      release_hold?: boolean;
    };
    err.retry = payload?.retry === true;
    err.release_hold = payload?.release_hold === true;
    throw err;
  }
  return payload as T;
}

export type AppointmentPaymentCheckout = {
  amount_centavos: number;
  total_centavos: number;
  remaining_centavos: number;
  expires_at: string | null;
  payment_enable_card: boolean;
  payment_enable_pix: boolean;
  payment_max_installments: number;
};

export async function createAppointmentPaymentCheckout(input: {
  agendamento_id: string;
  confirmation_token: string;
}): Promise<AppointmentPaymentCheckout> {
  const data = await invokePublicPaymentFunction<
    AppointmentPaymentCheckout & { ok?: boolean; already_confirmed?: boolean }
  >("mp-create-appointment-checkout", input);

  if (data.already_confirmed) {
    throw new Error("already_confirmed");
  }

  return data;
}

export async function processAppointmentPayment(input: {
  agendamento_id: string;
  confirmation_token: string;
  formData: Record<string, unknown>;
  payer_email?: string;
}): Promise<{
  ok?: boolean;
  status?: string;
  payment_id?: string;
  qr_code?: string | null;
  qr_code_base64?: string | null;
  ticket_url?: string | null;
  already_confirmed?: boolean;
  retry?: boolean;
  release_hold?: boolean;
  error?: string;
}> {
  return invokePublicPaymentFunction("mp-process-appointment-payment", input);
}

export async function verifyAppointmentPayment(input: {
  agendamento_id: string;
  confirmation_token: string;
}): Promise<{ ok?: boolean; status?: string; mp_status?: string }> {
  return invokePublicPaymentFunction("mp-verify-appointment-payment", input);
}

export const MP_PUBLIC_KEY = String(import.meta.env.VITE_MP_PUBLIC_KEY ?? "").trim();
