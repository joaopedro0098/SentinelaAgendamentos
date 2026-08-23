/**
 * POST /infobip-waba-connect-start
 *
 * Após Embedded Signup Meta, compartilha WABA com Infobip (share-waba).
 * Conclusão (connected) vem do webhook infobip-embedded-signup-webhook.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeApiKeyHeader(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.startsWith("App ") ? trimmed : `App ${trimmed}`;
}

function getInfobipShareWabaConfig(): { baseUrl: string; apiKeyHeader: string } {
  const apiKey = Deno.env.get("INFOBIP_API_KEY")?.trim();
  const baseUrl = Deno.env.get("INFOBIP_BASE_URL")?.trim();
  if (!apiKey || !baseUrl) {
    throw new Error("INFOBIP_API_KEY ou INFOBIP_BASE_URL não configurados no servidor.");
  }
  return { baseUrl: normalizeBaseUrl(baseUrl), apiKeyHeader: normalizeApiKeyHeader(apiKey) };
}

async function infobipShareWaba(
  wabaId: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown>; timedOut: boolean }> {
  const { baseUrl, apiKeyHeader } = getInfobipShareWabaConfig();
  const timeoutMs = 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/whatsapp/1/embedded-signup/registrations/share-waba`, {
      method: "POST",
      headers: {
        Authorization: apiKeyHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ businessAccountId: wabaId }),
      signal: controller.signal,
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data, timedOut: false };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 504, data: { error: "Timeout" }, timedOut: true };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let shopId: string | null = null;
  let serviceClient: ReturnType<typeof createClient> | null = null;

  const revertLock = async (status: "not_connected" | "error") => {
    if (!serviceClient || !shopId) return;
    try {
      await serviceClient.from("barbershops").update({
        waba_connect_status: status,
        updated_at: new Date().toISOString(),
      }).eq("id", shopId);
    } catch (e) {
      console.error("[infobip-waba-connect-start] Erro ao reverter lock:", e);
    }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Sessão inválida." }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }

    const wabaId = String(body.waba_id ?? "").trim();
    const phoneNumberId = String(body.phone_number_id ?? "").trim();

    if (!wabaId || !phoneNumberId) {
      return jsonResponse({ error: "Campos waba_id e phone_number_id são obrigatórios." }, 400);
    }

    serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: shop, error: shopErr } = await serviceClient
      .from("barbershops")
      .select("id, waba_id, waba_connect_status, updated_at")
      .eq("owner_id", userData.user.id)
      .maybeSingle();

    if (shopErr) return jsonResponse({ error: shopErr.message }, 500);
    if (!shop) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    shopId = shop.id;
    const currentStatus = String(shop.waba_connect_status ?? "");
    const currentWabaId = String(shop.waba_id ?? "").trim();

    if (currentStatus === "connected") {
      if (currentWabaId === wabaId) {
        return jsonResponse({
          success: true,
          status: "connected",
          message: "WhatsApp já está conectado.",
        });
      }
      return jsonResponse({
        error: "Desconecte o WhatsApp atual antes de conectar outra conta.",
        status: "connected",
      }, 409);
    }

    const lockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const filterStr =
      `waba_connect_status.eq.not_connected,` +
      `waba_connect_status.eq.error,` +
      `waba_connect_status.eq.token_expired,` +
      `and(waba_connect_status.eq.provisioning,updated_at.lt.${lockCutoff})`;

    const { data: lockData, error: lockErr } = await serviceClient
      .from("barbershops")
      .update({
        waba_connect_status: "provisioning",
        waba_id: wabaId,
        waba_phone_number_id: phoneNumberId,
        waba_connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId)
      .or(filterStr)
      .select("id");

    if (lockErr) return jsonResponse({ error: lockErr.message }, 500);

    if (!lockData?.length) {
      if (currentStatus === "provisioning") {
        return jsonResponse({
          error: "Conexão em andamento. Aguarde alguns minutos e tente novamente.",
          status: "provisioning",
        }, 409);
      }
      return jsonResponse({
        error: "Não foi possível iniciar a conexão neste momento.",
        status: currentStatus || undefined,
      }, 409);
    }

    const shareResult = await infobipShareWaba(wabaId);

    if (shareResult.ok && shareResult.status >= 200 && shareResult.status < 300) {
      return jsonResponse({
        success: true,
        status: "provisioning",
        message: "Registro iniciado. Aguarde a confirmação do WhatsApp.",
      });
    }

    const infobipStatus = shareResult.status;

    if (shareResult.timedOut || infobipStatus >= 500) {
      console.error("[infobip-waba-connect-start] Infobip 5xx/timeout:", shareResult.data);
      await revertLock("not_connected");
      return jsonResponse({ error: "Tempo esgotado ao registrar WhatsApp." }, 504);
    }

    if (infobipStatus === 429) {
      console.error("[infobip-waba-connect-start] Infobip 429:", shareResult.data);
      await revertLock("not_connected");
      return jsonResponse({ error: "Tente novamente em instantes." }, 503);
    }

    if (infobipStatus === 401 || infobipStatus === 403) {
      console.error("[infobip-waba-connect-start] Infobip auth erro:", shareResult.data);
      await revertLock("error");
      return jsonResponse({ error: "Falha ao comunicar com a Infobip." }, 502);
    }

    if (infobipStatus === 404) {
      console.error("[infobip-waba-connect-start] Infobip 404:", shareResult.data);
      await revertLock("error");
      return jsonResponse({ error: "Não foi possível registrar esta conta WhatsApp." }, 422);
    }

    if (infobipStatus === 409 || infobipStatus === 422) {
      console.error("[infobip-waba-connect-start] Infobip erro:", infobipStatus, shareResult.data);
      await revertLock("error");
      return jsonResponse(
        { error: "Não foi possível registrar esta conta WhatsApp." },
        infobipStatus === 409 ? 409 : 422,
      );
    }

    console.error("[infobip-waba-connect-start] Infobip resposta inesperada:", infobipStatus, shareResult.data);
    await revertLock("not_connected");
    return jsonResponse({ error: "Tempo esgotado ao registrar WhatsApp." }, 504);
  } catch (e) {
    console.error("[infobip-waba-connect-start] Erro interno:", e);

    if (e instanceof Error && e.message.includes("INFOBIP")) {
      if (shopId && serviceClient) {
        await revertLock("error");
      }
      return jsonResponse({ error: "Falha ao comunicar com a Infobip." }, 502);
    }

    if (shopId && serviceClient) {
      await revertLock("not_connected");
    }

    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
