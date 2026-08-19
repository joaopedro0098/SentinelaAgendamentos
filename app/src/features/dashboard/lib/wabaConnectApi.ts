import { supabase } from "@/integrations/supabase/client";

export type WabaConnectStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "error"
  | "token_expired"
  | "provisioning";

export type WabaConnectStartPayload = {
  waba_id: string;
  phone_number_id: string;
  phone_number: string;
  verification_method?: "sms" | "voice";
};

export type WabaConnectStartResult =
  | { ok: true; status: "connected" | "pending"; message?: string }
  | { ok: false; error: string; status?: string };

export type WabaConnectVerifyOtpResult =
  | { ok: true; status: "pending" | "connected"; message?: string }
  | { ok: false; error: string };

export type WabaConnectCheckStatusResult =
  | { ok: true; status: "connected" | "pending"; message?: string; sender_status?: string }
  | { ok: false; error: string; status?: string };

function parseFnError(error: unknown, data: unknown): string {
  if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  if (error instanceof Error) return error.message;
  return "Falha na comunicação com o servidor.";
}

export async function fetchWabaConnectStatus(): Promise<WabaConnectStatus | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("barbershops")
    .select("waba_connect_status")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return (data.waba_connect_status as WabaConnectStatus | null) ?? "not_connected";
}

export async function invokeWabaConnectStart(payload: WabaConnectStartPayload): Promise<WabaConnectStartResult> {
  const { data, error } = await supabase.functions.invoke("waba-connect-start", { body: payload });

  if (error) {
    return { ok: false, error: parseFnError(error, data), status: (data as { status?: string })?.status };
  }

  const body = data as { success?: boolean; status?: string; error?: string; message?: string };
  if (body.error) {
    return { ok: false, error: body.error, status: body.status };
  }
  if (body.success && (body.status === "connected" || body.status === "pending")) {
    return { ok: true, status: body.status, message: body.message };
  }
  return { ok: false, error: body.message || "Resposta inesperada ao iniciar conexão." };
}

export async function invokeWabaConnectVerifyOtp(verificationCode: string): Promise<WabaConnectVerifyOtpResult> {
  const { data, error } = await supabase.functions.invoke("waba-connect-verify-otp", {
    body: { verification_code: verificationCode },
  });

  if (error) {
    return { ok: false, error: parseFnError(error, data) };
  }

  const body = data as { success?: boolean; status?: string; error?: string; message?: string };
  if (body.error) {
    return { ok: false, error: body.error };
  }
  if (body.success && (body.status === "pending" || body.status === "connected")) {
    return { ok: true, status: body.status, message: body.message };
  }
  return { ok: false, error: body.message || "Resposta inesperada ao validar código." };
}

export async function invokeWabaConnectCheckStatus(): Promise<WabaConnectCheckStatusResult> {
  const { data, error } = await supabase.functions.invoke("waba-connect-check-status", { body: {} });

  if (error) {
    return { ok: false, error: parseFnError(error, data), status: (data as { status?: string })?.status };
  }

  const body = data as { success?: boolean; status?: string; error?: string; message?: string; sender_status?: string };
  if (body.error) {
    return { ok: false, error: body.error, status: body.status };
  }
  if (body.success && (body.status === "connected" || body.status === "pending")) {
    return { ok: true, status: body.status, message: body.message, sender_status: body.sender_status };
  }
  return { ok: false, error: body.message || "Resposta inesperada ao verificar status." };
}

export async function pollWabaConnectUntilOnline(options?: {
  maxAttempts?: number;
  intervalMs?: number;
  onAttempt?: (attempt: number) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const maxAttempts = options?.maxAttempts ?? 12;
  const intervalMs = options?.intervalMs ?? 15_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options?.onAttempt?.(attempt);
    const result = await invokeWabaConnectCheckStatus();
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    if (result.status === "connected") {
      return { ok: true };
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { ok: false, error: "Tempo esgotado aguardando ativação do número pelo WhatsApp. Tente conectar novamente." };
}

const PROVISIONING_DB_POLL_INTERVAL_MS = 20_000;
const PROVISIONING_DB_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const PROVISIONING_DB_NULL_STREAK_LIMIT = 2;

/** Aguarda o backend sair de `provisioning` (só leitura no Postgres, sem Twilio). */
export async function pollWabaConnectStatusFromDb(options?: {
  intervalMs?: number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
}): Promise<
  | { ok: true; status: "pending" | "connected" }
  | { ok: false; error: string; reason: "timeout" | "unexpected_status" | "fetch_failed" }
> {
  const intervalMs = options?.intervalMs ?? PROVISIONING_DB_POLL_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? PROVISIONING_DB_POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let consecutiveNulls = 0;

  while (Date.now() < deadline) {
    if (options?.isCancelled?.()) {
      return { ok: false, error: "Operação cancelada.", reason: "timeout" };
    }

    const current = await fetchWabaConnectStatus();

    if (current === null) {
      consecutiveNulls += 1;
      if (consecutiveNulls >= PROVISIONING_DB_NULL_STREAK_LIMIT) {
        return {
          ok: false,
          error: "Não foi possível verificar o status da conexão. Faça login novamente e tente de novo.",
          reason: "fetch_failed",
        };
      }
    } else {
      consecutiveNulls = 0;

      if (current === "connected") {
        return { ok: true, status: "connected" };
      }
      if (current === "pending") {
        return { ok: true, status: "pending" };
      }
      if (current !== "provisioning") {
        return {
          ok: false,
          error: "A conexão foi interrompida. Tente novamente.",
          reason: "unexpected_status",
        };
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }

  return {
    ok: false,
    error: "A conexão demorou mais que o esperado. Tente novamente.",
    reason: "timeout",
  };
}
