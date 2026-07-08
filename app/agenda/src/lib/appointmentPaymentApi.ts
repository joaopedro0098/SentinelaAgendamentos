const SUPABASE_FUNCTIONS_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
).trim();

export type AppointmentPaymentErrorDetails = {
  title: string;
  message: string;
  hint: string | null;
  mp_code: number | null;
  mp_status_detail: string | null;
  retry: boolean;
  release_hold: boolean;
  raw_message?: string | null;
};

type FunctionErrorPayload = {
  error?: string;
  message?: string;
  error_title?: string;
  error_hint?: string | null;
  mp_code?: number | null;
  mp_status_detail?: string | null;
  retry?: boolean;
  release_hold?: boolean;
  raw_message?: string | null;
  [key: string]: unknown;
};

async function readFunctionPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as FunctionErrorPayload;
  } catch {
    return { message: text };
  }
}

function explainPaymentErrorLocally(message: string): AppointmentPaymentErrorDetails {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid users involved")) {
    return {
      title: "Usuários incompatíveis (teste × produção)",
      message: "O Mercado Pago detectou mistura entre conta teste e conta real.",
      hint:
        "Use comprador teste (e-mail/CPF do painel MP), vendedor teste conectado e chave TEST- da mesma app.",
      mp_code: 145,
      mp_status_detail: null,
      retry: true,
      release_hold: false,
    };
  }

  if (normalized.includes("invalid test user email")) {
    return {
      title: "E-mail de comprador teste inválido",
      message: "No modo teste, use o e-mail do comprador teste criado no Mercado Pago.",
      hint: "Mercado Pago Developers → Contas de teste → Comprador.",
      mp_code: null,
      mp_status_detail: null,
      retry: true,
      release_hold: false,
    };
  }

  return {
    title: "Erro no pagamento",
    message,
    hint: null,
    mp_code: null,
    mp_status_detail: null,
    retry: true,
    release_hold: false,
  };
}

export function parseAppointmentPaymentErrorPayload(
  payload: FunctionErrorPayload | null | undefined,
): AppointmentPaymentErrorDetails {
  if (!payload) {
    return explainPaymentErrorLocally("Não foi possível processar o pagamento.");
  }

  if (payload.error_title || payload.error_hint || payload.mp_code != null || payload.mp_status_detail) {
    return {
      title: String(payload.error_title ?? "Erro no pagamento"),
      message: String(payload.error ?? payload.message ?? "Não foi possível processar o pagamento."),
      hint: payload.error_hint != null ? String(payload.error_hint) : null,
      mp_code: typeof payload.mp_code === "number" ? payload.mp_code : null,
      mp_status_detail:
        payload.mp_status_detail != null ? String(payload.mp_status_detail) : null,
      retry: payload.retry !== false,
      release_hold: payload.release_hold === true,
      raw_message: payload.raw_message != null ? String(payload.raw_message) : null,
    };
  }

  return explainPaymentErrorLocally(
    String(payload.error ?? payload.message ?? "Não foi possível processar o pagamento."),
  );
}

export class AppointmentPaymentError extends Error {
  details: AppointmentPaymentErrorDetails;

  constructor(details: AppointmentPaymentErrorDetails) {
    super(details.message);
    this.name = "AppointmentPaymentError";
    this.details = details;
  }
}

async function invokePublicPaymentFunction<T>(
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
    throw new AppointmentPaymentError(parseAppointmentPaymentErrorPayload(payload));
  }
  return payload as T;
}

export type AppointmentPaymentCheckout = {
  charge_base_centavos: number;
  amount_pix_centavos: number;
  amount_card_centavos: number;
  total_centavos: number;
  remaining_centavos: number;
  expires_at: string | null;
  payment_enable_card: boolean;
  payment_enable_pix: boolean;
  payment_pass_fee_card?: boolean;
  payment_pass_fee_pix?: boolean;
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
  error_title?: string;
  error_hint?: string | null;
  mp_code?: number | null;
  mp_status_detail?: string | null;
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
export const MP_TEST_MODE = MP_PUBLIC_KEY.startsWith("TEST-");

function formatAppointmentPaymentError(message: string): string {
  return explainPaymentErrorLocally(message).message;
}

export function paymentErrorToastDescription(details: AppointmentPaymentErrorDetails): string {
  const parts = [details.message];
  if (details.hint) parts.push(details.hint);
  if (MP_TEST_MODE && (details.mp_code != null || details.mp_status_detail)) {
    const codes = [
      details.mp_code != null ? `código MP ${details.mp_code}` : null,
      details.mp_status_detail ? `detalhe ${details.mp_status_detail}` : null,
    ].filter(Boolean);
    if (codes.length) parts.push(`(${codes.join(", ")})`);
  }
  return parts.join(" ");
}
