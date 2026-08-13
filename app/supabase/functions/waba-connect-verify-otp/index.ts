import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptWabaToken } from "../_shared/wabaCrypto.ts";

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

function twilioBasicAuth(sid: string, token: string): string {
  return "Basic " + btoa(`${sid}:${token}`);
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

    // 2. Leitura e validação do payload
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }

    const verificationCode = String(body.verification_code ?? "").trim();
    if (!verificationCode) {
      return jsonResponse({ error: "O campo verification_code é obrigatório." }, 400);
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

    const subaccountSid = String(shop.twilio_subaccount_sid ?? "").trim();
    const senderSid = String(shop.sender_sid ?? "").trim();
    const encryptedToken = String(shop.twilio_subaccount_auth_token ?? "").trim();

    if (!subaccountSid || !senderSid || !encryptedToken) {
      return jsonResponse({
        error: "Nenhuma conexão pendente encontrada. Inicie o processo de conexão novamente.",
      }, 409);
    }

    if (shop.waba_connect_status === "connected") {
      return jsonResponse({ success: true, status: "connected", message: "WhatsApp já está conectado." });
    }

    // 4. Decifra o Auth Token da subconta
    const subaccountAuthToken = await decryptWabaToken(encryptedToken);

    // 5. Envia o código de verificação para a Twilio Senders API
    // POST /v2/Channels/Senders/{Sid} com verification_code confirma o OTP
    const body2 = new URLSearchParams({ verification_code: verificationCode });

    const res = await fetch(`https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`, {
      method: "POST",
      headers: {
        Authorization: twilioBasicAuth(subaccountSid, subaccountAuthToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body2,
    });

    const resText = await res.text();
    let resData: Record<string, unknown> = {};
    try {
      resData = JSON.parse(resText);
    } catch {
      resData = { raw: resText };
    }

    // 6. Tratamento de resposta da Twilio
    if (!res.ok) {
      const twilioMessage = String(resData.message ?? resData.raw ?? "Código inválido.");
      console.error("[waba-connect-verify-otp] Twilio rejeitou o código:", resData);

      // HTTP 400/422 da Twilio indica código incorreto ou expirado
      if (res.status === 400 || res.status === 422) {
        return jsonResponse({
          error: "Código de verificação incorreto ou expirado. Verifique o SMS e tente novamente.",
          twilio_message: twilioMessage,
        }, 400);
      }

      return jsonResponse({
        error: "Erro ao validar o código com a Twilio. Tente novamente.",
        twilio_message: twilioMessage,
      }, 502);
    }

    // 7. Código aceito — mantém status 'pending' (aguardando Twilio/Meta ativarem o Sender para ONLINE)
    // O status 'connected' só é gravado pelo waba-connect-check-status quando o Sender virar ONLINE
    console.log("[waba-connect-verify-otp] Código aceito para sender:", senderSid);

    return jsonResponse({
      success: true,
      status: "pending",
      message: "Código validado com sucesso. Aguardando ativação do número pelo WhatsApp...",
    });
  } catch (e) {
    console.error("[waba-connect-verify-otp] Erro interno:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
