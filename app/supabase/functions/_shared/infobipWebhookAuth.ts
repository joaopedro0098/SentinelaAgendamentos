/**
 * Autenticação de webhooks Infobip (subscription sentinela_webhook_infobip).
 *
 * Suporta HTTP Basic Auth e API Key (Authorization: App {key}).
 * Configure no Supabase secrets conforme o método escolhido no portal Infobip.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function normalizeBasicAuthHeader(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("Basic ") ? trimmed.slice(6).trim() : trimmed;
}

export async function verifyInfobipWebhook(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";

  const expectedBasic = Deno.env.get("INFOBIP_WEBHOOK_BASIC_AUTH")?.trim();
  if (expectedBasic) {
    if (!authHeader.startsWith("Basic ")) {
      console.error("infobip webhook auth: esperado Basic Auth, header ausente ou inválido.");
      return false;
    }
    const received = normalizeBasicAuthHeader(authHeader);
    const expected = normalizeBasicAuthHeader(expectedBasic);
    if (timingSafeEqual(received, expected)) return true;
    console.error("infobip webhook auth: Basic Auth inválido.");
    return false;
  }

  const expectedApiKey = Deno.env.get("INFOBIP_WEBHOOK_API_KEY")?.trim();
  if (expectedApiKey) {
    const normalizedExpected = expectedApiKey.startsWith("App ")
      ? expectedApiKey
      : `App ${expectedApiKey}`;
    if (timingSafeEqual(authHeader, normalizedExpected)) return true;
    console.error("infobip webhook auth: API Key inválida.");
    return false;
  }

  console.error(
    "infobip webhook auth: nenhum método configurado (INFOBIP_WEBHOOK_BASIC_AUTH ou INFOBIP_WEBHOOK_API_KEY).",
  );
  return false;
}
