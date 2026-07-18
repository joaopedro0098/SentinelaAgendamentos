const PANEL_SOURCE = "sentinela-connect-panel";
const EXT_SOURCE = "sentinela-connect-extension";

export function getExtensionConnectApiUrl() {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}/functions/v1/extension-connect` : "";
}

export function getConnectAppBaseUrl() {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return "https://sentinelagendamentos.com";
}

export const CONNECT_EXTENSION_STORE_URL = String(import.meta.env.VITE_CONNECT_EXTENSION_STORE_URL ?? "").trim();

type BridgeResponse = {
  requestId?: string;
  installed?: boolean;
  ok?: boolean;
  pingOk?: boolean;
  message?: string;
};

function postToExtensionBridge(type: string, payload: Record<string, unknown>, timeoutMs: number) {
  return new Promise<BridgeResponse | null>((resolve) => {
    const requestId = crypto.randomUUID();

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as BridgeResponse | undefined;
      if (!data || (data as { source?: string }).source !== EXT_SOURCE || data.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      resolve(data);
    };

    window.addEventListener("message", handler);
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, timeoutMs);

    window.postMessage({ source: PANEL_SOURCE, type, requestId, ...payload }, "*");
  });
}

export async function isConnectExtensionInstalled() {
  const response = await postToExtensionBridge("CHECK_INSTALLED", {}, 800);
  return Boolean(response?.installed);
}

export async function configureConnectExtension(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false as const, reason: "missing_token" as const };
  }

  const response = await postToExtensionBridge(
    "CONFIGURE",
    {
      token: trimmed,
      apiBaseUrl: getExtensionConnectApiUrl(),
      appBaseUrl: getConnectAppBaseUrl(),
    },
    5000,
  );

  if (!response) {
    return { ok: false as const, reason: "not_installed" as const };
  }

  if (!response.ok) {
    return {
      ok: false as const,
      reason: "configure_failed" as const,
      message: response.message,
    };
  }

  return {
    ok: true as const,
    pingOk: Boolean(response.pingOk),
    message: response.message,
  };
}
