const DEFAULT_APP_URL = "https://sentinelagendamentos.com";

export function getAppBaseUrl() {
  return (Deno.env.get("APP_URL")?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "");
}

export function extensionConnectCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin =
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("http://localhost") ||
    origin.includes("sentinelagendamentos.com")
      ? origin
      : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-sentinela-token",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

export function jsonResponse(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...extensionConnectCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}
