import { supabase } from "@/integrations/supabase/client";

export type WabaConnectStatus =
  | "not_connected"
  | "pending"
  | "connected"
  | "error"
  | "token_expired"
  | "provisioning";

export type InfobipWabaConnectStartPayload = {
  waba_id: string;
  phone_number_id: string;
};

export type MetaWabaConnectStartPayload = {
  code: string;
  waba_id: string;
  phone_number_id: string;
  flow_type: "new_phone_number" | "only_waba" | "existing_phone_number";
  business_id?: string;
  /** Epoch ms quando o frontend capturou o code no callback FB.login (monitorar expiração 30s). */
  code_captured_at_ms?: number;
};

export type InfobipWabaConnectStartResult =
  | { ok: true; status: "connected" | "provisioning"; message?: string }
  | { ok: false; error: string; status?: string };

export type MetaWabaConnectStartResult =
  | { ok: true; status: "connected"; message?: string }
  | { ok: false; error: string; status?: string };

export type WabaDisconnectResult =
  | { ok: true; status: "not_connected"; message?: string }
  | { ok: false; error: string };

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

/** POST meta-waba-connect-start (Embedded Signup Meta Direct / Tech Provider). */
export async function invokeMetaWabaConnectStart(
  payload: MetaWabaConnectStartPayload,
): Promise<MetaWabaConnectStartResult> {
  const { data, error } = await supabase.functions.invoke("meta-waba-connect-start", { body: payload });

  if (error) {
    return { ok: false, error: parseFnError(error, data), status: (data as { status?: string })?.status };
  }

  const body = data as { success?: boolean; status?: string; error?: string; message?: string };
  if (body.error) {
    return { ok: false, error: body.error, status: body.status };
  }
  if (body.success && body.status === "connected") {
    return { ok: true, status: "connected", message: body.message };
  }
  return { ok: false, error: body.message || "Resposta inesperada ao conectar WhatsApp." };
}

/** POST infobip-waba-connect-start (share-waba Infobip após Embedded Signup Meta). */
export async function invokeInfobipWabaConnectStart(
  payload: InfobipWabaConnectStartPayload,
): Promise<InfobipWabaConnectStartResult> {
  const { data, error } = await supabase.functions.invoke("infobip-waba-connect-start", { body: payload });

  if (error) {
    return { ok: false, error: parseFnError(error, data), status: (data as { status?: string })?.status };
  }

  const body = data as { success?: boolean; status?: string; error?: string; message?: string };
  if (body.error) {
    return { ok: false, error: body.error, status: body.status };
  }
  if (body.success && (body.status === "connected" || body.status === "provisioning")) {
    return { ok: true, status: body.status, message: body.message };
  }
  return { ok: false, error: body.message || "Resposta inesperada ao iniciar conexão." };
}

export async function invokeWabaDisconnect(): Promise<WabaDisconnectResult> {
  const { data, error } = await supabase.functions.invoke("waba-disconnect", { body: {} });

  if (error) {
    return { ok: false, error: parseFnError(error, data) };
  }

  const body = data as { success?: boolean; status?: string; error?: string; message?: string };
  if (body.error) {
    return { ok: false, error: body.error };
  }
  if (body.success && body.status === "not_connected") {
    return { ok: true, status: "not_connected", message: body.message };
  }
  return { ok: false, error: body.message || "Resposta inesperada ao desconectar." };
}

const PROVISIONING_DB_POLL_INTERVAL_MS = 20_000;
const PROVISIONING_DB_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const PROVISIONING_DB_NULL_STREAK_LIMIT = 2;

/** Aguarda `waba_connect_status === connected` via leitura no Postgres (webhook Infobip). */
export async function pollWabaConnectStatusFromDb(options?: {
  intervalMs?: number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
}): Promise<
  | { ok: true; status: "connected" }
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
      if (current !== "provisioning" && current !== "pending") {
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
