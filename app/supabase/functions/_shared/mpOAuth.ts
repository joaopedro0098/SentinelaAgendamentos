const MP_AUTH_BASE = "https://auth.mercadopago.com/authorization";
const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";

export function getMpAppointmentsClientId(): string {
  return (
    Deno.env.get("MP_APPOINTMENTS_CLIENT_ID")?.trim() ||
    Deno.env.get("MP_CLIENT_ID")?.trim() ||
    ""
  );
}

export function getMpAppointmentsClientSecret(): string {
  return (
    Deno.env.get("MP_APPOINTMENTS_CLIENT_SECRET")?.trim() ||
    Deno.env.get("MP_CLIENT_SECRET")?.trim() ||
    ""
  );
}

export function isMpOAuthTestMode(): boolean {
  const raw = Deno.env.get("MP_APPOINTMENTS_OAUTH_TEST_MODE")?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function cleanAppUrl(value: string | null | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export function resolveAppOrigin(fallback?: string | null): string {
  return (
    cleanAppUrl(Deno.env.get("APP_URL")) ||
    cleanAppUrl(fallback) ||
    "https://sentinelagendamentos.com"
  );
}

export function mpOAuthRedirectUri(supabaseUrl: string): string {
  return `${cleanAppUrl(supabaseUrl)}/functions/v1/mp-oauth-callback`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

export function generateOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function buildMpAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(MP_AUTH_BASE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("platform_id", "mp");
  return url.toString();
}

export async function exchangeMpAuthorizationCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  testMode?: boolean;
}): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  };

  if (params.testMode) {
    body.test_token = "true";
  }

  const res = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}

export async function refreshMpAccessToken(refreshToken: string): Promise<Record<string, unknown>> {
  const clientId = getMpAppointmentsClientId();
  const clientSecret = getMpAppointmentsClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("OAuth Mercado Pago não configurado.");
  }

  const body: Record<string, unknown> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  if (isMpOAuthTestMode()) {
    body.test_token = "true";
  }

  const res = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message)
        : "Não foi possível renovar token Mercado Pago.";
    throw new Error(message);
  }

  return payload as Record<string, unknown>;
}
