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
  options: { method: string; auth: string; body?: URLSearchParams },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const headers: HeadersInit = {
    Authorization: options.auth,
  };
  if (options.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(url, {
    method: options.method,
    headers,
    body: options.body,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: shop, error: shopErr } = await serviceClient
      .from("barbershops")
      .select("id, twilio_subaccount_sid, twilio_subaccount_auth_token, sender_sid, waba_connect_status")
      .eq("owner_id", userId)
      .maybeSingle();

    if (shopErr) return jsonResponse({ error: shopErr.message }, 500);
    if (!shop) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    const shopId: string = shop.id;
    let subaccountSid: string = shop.twilio_subaccount_sid ?? "";
    let subaccountAuthTokenEncrypted: string = shop.twilio_subaccount_auth_token ?? "";
    let subaccountAuthToken = "";

    // 4. CRIAÇÃO / REUSO DA SUBCONTA TWILIO (Accounts API)
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
        return jsonResponse({ error: "Falha ao criar subconta na Twilio. Tente novamente." }, 502);
      }

      subaccountSid = String(createSubRes.data.sid ?? "");
      subaccountAuthToken = String(createSubRes.data.auth_token ?? "");
      subaccountAuthTokenEncrypted = await encryptWabaToken(subaccountAuthToken);

      // 5. GRAVAÇÃO IMEDIATA DA SUBCONTA (antes de tentar o Sender, para evitar subcontas órfãs)
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
        return jsonResponse({ error: "Erro ao salvar credenciais da subconta." }, 500);
      }
    } else {
      // Decifra o token existente para uso nas chamadas Twilio
      subaccountAuthToken = await decryptWabaToken(subaccountAuthTokenEncrypted);
    }

    // 6. IDEMPOTÊNCIA: Verificar se já existe um sender_sid pendente
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
          // Sender já está ativo — atualiza o banco e retorna sucesso sem disparar novo OTP
          await serviceClient.from("barbershops").update({
            waba_connect_status: "connected",
            waba_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", shopId);

          return jsonResponse({ success: true, status: "connected", sender_sid: senderSid });
        }

        // Status OFFLINE: exclui o Sender pendente para recriar com novo OTP
        const deleteSenderRes = await twilioFetch(
          `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`,
          { method: "DELETE", auth: twilioBasicAuth(subaccountSid, subaccountAuthToken) },
        );

        if (!deleteSenderRes.ok && deleteSenderRes.status !== 404) {
          // 404 é aceitável (Sender já não existe na Twilio); qualquer outro erro bloqueia
          console.error("[waba-connect-start] Falha ao deletar Sender antigo:", deleteSenderRes.data);
          return jsonResponse({
            error: "Não foi possível limpar a tentativa anterior de conexão. Aguarde alguns minutos e tente novamente.",
          }, 502);
        }

        senderSid = "";

        // Limpa sender_sid obsoleto no banco
        await serviceClient.from("barbershops").update({
          sender_sid: null,
          updated_at: new Date().toISOString(),
        }).eq("id", shopId);
      }
    }

    // 7. CRIAÇÃO DO SENDER + DISPARO DO OTP (Senders API)
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
      return jsonResponse({ error: "Falha ao registrar WhatsApp Sender na Twilio. Tente novamente." }, 502);
    }

    senderSid = String(createSenderRes.data.sid ?? "");

    // 8. GRAVAÇÃO FINAL DO ESTADO NO BANCO
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
      return jsonResponse({ error: "Erro ao salvar estado da integração." }, 500);
    }

    return jsonResponse({
      success: true,
      status: "pending",
      sender_sid: senderSid,
      verification_method: verificationMethod,
      message: `Código OTP enviado via ${verificationMethod === "sms" ? "SMS" : "chamada de voz"}.`,
    });
  } catch (e) {
    console.error("[waba-connect-start] Erro interno:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
