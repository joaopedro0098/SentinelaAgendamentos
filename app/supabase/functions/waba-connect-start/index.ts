import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encryptWabaToken, decryptWabaToken } from "../_shared/wabaCrypto.ts";

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

function getTwiliaMasterCredentials(): { accountSid: string; authToken: string } {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN não configurados no servidor.");
  }
  return { accountSid, authToken };
}

function twilioBasicAuth(sid: string, token: string): string {
  return "Basic " + btoa(`${sid}:${token}`);
}

async function twilioFetch(
  url: string,
  options: { method: string; auth: string; body?: URLSearchParams; timeoutMs?: number },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const timeoutMs = options.timeoutMs ?? 10000; // 10 segundos por padrão
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: HeadersInit = {
    Authorization: options.auth,
  };
  if (options.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  try {
    const res = await fetch(url, {
      method: options.method,
      headers,
      body: options.body,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[twilioFetch] Timeout de ${timeoutMs}ms excedido na requisição para: ${url}`);
      return {
        ok: false,
        status: 504,
        data: { error: "Timeout ao comunicar com a Twilio. Tente novamente." },
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let lockedShopId: string | null = null;
  let serviceClient: ReturnType<typeof createClient> | null = null;

  const unlockOnError = async (shopId: string) => {
    if (!serviceClient) return;
    try {
      await serviceClient.from("barbershops").update({
        waba_connect_status: "not_connected",
        updated_at: new Date().toISOString(),
      }).eq("id", shopId);
    } catch (e) {
      console.error("[waba-connect-start] Erro ao reverter lock 'provisioning':", e);
    }
  };

  try {
    // 1. Autenticação de sessão via JWT do usuário logado
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

    const userId = userData.user.id;

    // 2. Leitura e validação do payload do frontend
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }

    const wabaId = String(body.waba_id ?? "").trim();
    const phoneNumberId = String(body.phone_number_id ?? "").trim();
    const phoneNumber = String(body.phone_number ?? "").trim();
    const verificationMethod = String(body.verification_method ?? "sms").toLowerCase();

    if (!wabaId || !phoneNumberId || !phoneNumber) {
      return jsonResponse({ error: "Campos waba_id, phone_number_id e phone_number são obrigatórios." }, 400);
    }
    if (verificationMethod !== "sms" && verificationMethod !== "voice") {
      return jsonResponse({ error: "verification_method deve ser 'sms' ou 'voice'." }, 400);
    }

    // 3. Busca a barbearia do usuário logado
    serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: shop, error: shopErr } = await serviceClient
      .from("barbershops")
      .select("id, twilio_subaccount_sid, twilio_subaccount_auth_token, sender_sid, waba_connect_status, updated_at")
      .eq("owner_id", userId)
      .maybeSingle();

    if (shopErr) return jsonResponse({ error: shopErr.message }, 500);
    if (!shop) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    const shopId: string = shop.id;
    const currentStatus = String(shop.waba_connect_status ?? "");
    const currentSenderSid = String(shop.sender_sid ?? "").trim();
    const currentSubaccountSid = String(shop.twilio_subaccount_sid ?? "").trim();
    const encryptedToken = String(shop.twilio_subaccount_auth_token ?? "").trim();

    // 4. CHECAGEM PRÉ-LOCK PARA STATUS 'pending' (Recuperação e Validação Silenciosa)
    if (currentStatus === "pending" && currentSenderSid && currentSubaccountSid && encryptedToken) {
      const subaccountAuthToken = await decryptWabaToken(encryptedToken);

      // Consulta se o Sender virou ONLINE assincronamente na Twilio/Meta
      const checkSenderRes = await twilioFetch(
        `https://messaging.twilio.com/v2/Channels/Senders/${currentSenderSid}`,
        {
          method: "GET",
          auth: twilioBasicAuth(currentSubaccountSid, subaccountAuthToken),
        },
      );

      if (checkSenderRes.ok) {
        const twilioStatus = String(checkSenderRes.data.status ?? "").toUpperCase();
        if (twilioStatus === "ONLINE") {
          // Ativação concluída! Atualiza o banco para connected e retorna sucesso
          await serviceClient.from("barbershops").update({
            waba_connect_status: "connected",
            waba_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", shopId);

          return jsonResponse({ success: true, status: "connected", sender_sid: currentSenderSid });
        }
      }
    }

    // 5. AQUISIÇÃO DO LOCK OTIMISTA (Cobre toda a função do início ao fim)
    // Janelas de expiração (decisão de design do projeto):
    // - otpCutoff: 10 minutos (tempo limite de cooldown para solicitar um novo OTP)
    // - lockCutoff: 5 minutos (tempo limite para expirar um lock 'provisioning' travado)
    const otpCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const lockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { count, error: lockErr } = await serviceClient
      .from("barbershops")
      .update({
        waba_connect_status: "provisioning",
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId)
      .or(
        `waba_connect_status.eq.not_connected,` +
        `waba_connect_status.eq.error,` +
        `waba_connect_status.eq.token_expired,` +
        `and(waba_connect_status.eq.pending,updated_at.lt.${otpCutoff}),` +
        `and(waba_connect_status.eq.provisioning,updated_at.lt.${lockCutoff})`
      )
      .select("id", { count: "exact", head: true });

    if (lockErr) {
      return jsonResponse({ error: lockErr.message }, 500);
    }

    if ((count ?? 0) === 0) {
      // Lock não adquirido — determina o motivo para retornar resposta 409 adequada
      if (currentStatus === "pending") {
        return jsonResponse({
          error: "Um código OTP já foi enviado recentemente. Insira o código recebido para continuar ou aguarde alguns minutos para solicitar um novo.",
          status: "pending",
        }, 409);
      }

      if (currentStatus === "connected") {
        return jsonResponse({
          error: "WhatsApp já está conectado.",
          status: "connected",
        }, 409);
      }

      // Status 'provisioning' com lock ativo (menos de 5 min)
      return jsonResponse({
        error: "Conexão já em andamento. Aguarde alguns instantes e tente novamente.",
        status: "provisioning",
      }, 409);
    }

    // Lock adquirido com sucesso! Marca o ID da loja travada para reversão no catch em caso de erro.
    lockedShopId = shopId;

    let subaccountSid: string = shop.twilio_subaccount_sid ?? "";
    let subaccountAuthTokenEncrypted: string = shop.twilio_subaccount_auth_token ?? "";
    let subaccountAuthToken = "";

    // 6. CRIAÇÃO / REUSO DA SUBCONTA TWILIO (Accounts API)
    const { accountSid: masterSid, authToken: masterToken } = getTwiliaMasterCredentials();

    if (!subaccountSid) {
      // Cria uma subconta nova para esta barbearia
      const createSubRes = await twilioFetch(
        "https://api.twilio.com/2010-04-01/Accounts.json",
        {
          method: "POST",
          auth: twilioBasicAuth(masterSid, masterToken),
          body: new URLSearchParams({ FriendlyName: `Sentinela_Shop_${shopId}` }),
        },
      );

      if (!createSubRes.ok) {
        console.error("[waba-connect-start] Falha ao criar subconta Twilio:", createSubRes.data);
        await unlockOnError(shopId);
        lockedShopId = null;
        return jsonResponse({ error: (createSubRes.data.error as string) || "Falha ao criar subconta na Twilio. Tente novamente." }, createSubRes.status === 504 ? 504 : 502);
      }

      subaccountSid = String(createSubRes.data.sid ?? "");
      subaccountAuthToken = String(createSubRes.data.auth_token ?? "");
      subaccountAuthTokenEncrypted = await encryptWabaToken(subaccountAuthToken);

      // GRAVAÇÃO IMEDIATA DA SUBCONTA (Evita subcontas órfãs se etapas seguintes falharem)
      const { error: saveSubErr } = await serviceClient
        .from("barbershops")
        .update({
          twilio_subaccount_sid: subaccountSid,
          twilio_subaccount_auth_token: subaccountAuthTokenEncrypted,
          updated_at: new Date().toISOString(),
        })
        .eq("id", shopId);

      if (saveSubErr) {
        console.error("[waba-connect-start] Erro ao gravar subconta no banco:", saveSubErr);
        await unlockOnError(shopId);
        lockedShopId = null;
        return jsonResponse({ error: "Erro ao salvar credenciais da subconta." }, 500);
      }
    } else {
      // Decifra o token existente para uso nas chamadas Twilio
      subaccountAuthToken = await decryptWabaToken(subaccountAuthTokenEncrypted);
    }

    // 7. IDEMPOTÊNCIA: Verificar se já existe um sender_sid pendente
    let senderSid: string = shop.sender_sid ?? "";

    if (senderSid) {
      // Consulta o status do Sender existente
      const getSenderRes = await twilioFetch(
        `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`,
        {
          method: "GET",
          auth: twilioBasicAuth(subaccountSid, subaccountAuthToken),
        },
      );

      if (getSenderRes.ok) {
        const existingStatus = String(getSenderRes.data.status ?? "").toUpperCase();

        if (existingStatus === "ONLINE") {
          // Sender já está ativo — atualiza o banco para connected e libera lock
          await serviceClient.from("barbershops").update({
            waba_connect_status: "connected",
            waba_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", shopId);

          lockedShopId = null;
          return jsonResponse({ success: true, status: "connected", sender_sid: senderSid });
        }

        // Status OFFLINE: exclui o Sender pendente para recriar com novo OTP
        const deleteSenderRes = await twilioFetch(
          `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`,
          { method: "DELETE", auth: twilioBasicAuth(subaccountSid, subaccountAuthToken) },
        );

        if (!deleteSenderRes.ok && deleteSenderRes.status !== 404) {
          console.error("[waba-connect-start] Falha ao deletar Sender antigo:", deleteSenderRes.data);
          await unlockOnError(shopId);
          lockedShopId = null;
          return jsonResponse({
            error: (deleteSenderRes.data.error as string) || "Não foi possível limpar a tentativa anterior de conexão. Aguarde alguns minutos e tente novamente.",
          }, deleteSenderRes.status === 504 ? 504 : 502);
        }

        senderSid = "";

        // Limpa sender_sid obsoleto no banco
        await serviceClient.from("barbershops").update({
          sender_sid: null,
          updated_at: new Date().toISOString(),
        }).eq("id", shopId);
      }
    }

    // 8. CRIAÇÃO DO SENDER + DISPARO DO OTP (Senders API)
    const senderBody = new URLSearchParams({
      sender_id: `whatsapp:${phoneNumber}`,
      waba_id: wabaId,
      verification_method: verificationMethod,
    });

    const createSenderRes = await twilioFetch(
      "https://messaging.twilio.com/v2/Channels/Senders",
      {
        method: "POST",
        auth: twilioBasicAuth(subaccountSid, subaccountAuthToken),
        body: senderBody,
      },
    );

    if (!createSenderRes.ok) {
      console.error("[waba-connect-start] Falha ao criar Sender Twilio:", createSenderRes.data);
      await unlockOnError(shopId);
      lockedShopId = null;
      return jsonResponse({ error: (createSenderRes.data.error as string) || "Falha ao registrar WhatsApp Sender na Twilio. Tente novamente." }, createSenderRes.status === 504 ? 504 : 502);
    }

    senderSid = String(createSenderRes.data.sid ?? "");

    // 9. GRAVAÇÃO FINAL DO ESTADO NO BANCO (Passa de 'provisioning' para 'pending')
    const { error: saveFinalErr } = await serviceClient
      .from("barbershops")
      .update({
        waba_id: wabaId,
        waba_phone_number_id: phoneNumberId,
        sender_sid: senderSid,
        waba_connect_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId);

    if (saveFinalErr) {
      console.error("[waba-connect-start] Erro ao gravar estado final:", saveFinalErr);
      await unlockOnError(shopId);
      lockedShopId = null;
      return jsonResponse({ error: "Erro ao salvar estado da integração." }, 500);
    }

    lockedShopId = null;
    return jsonResponse({
      success: true,
      status: "pending",
      sender_sid: senderSid,
      verification_method: verificationMethod,
      message: `Código OTP enviado via ${verificationMethod === "sms" ? "SMS" : "chamada de voz"}.`,
    });
  } catch (e) {
    console.error("[waba-connect-start] Erro interno:", e);

    if (lockedShopId) {
      await unlockOnError(lockedShopId);
      lockedShopId = null;
    }

    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
