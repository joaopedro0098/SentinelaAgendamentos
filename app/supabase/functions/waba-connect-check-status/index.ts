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

    // 2. Busca a barbearia do usuário logado
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: shop, error: shopErr } = await serviceClient
      .from("barbershops")
      .select("id, twilio_subaccount_sid, twilio_subaccount_auth_token, sender_sid, waba_connect_status")
      .eq("owner_id", userId)
      .maybeSingle();

    if (shopErr) return jsonResponse({ error: shopErr.message }, 500);
    if (!shop) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    const shopId: string = shop.id;
    const subaccountSid = String(shop.twilio_subaccount_sid ?? "").trim();
    const senderSid = String(shop.sender_sid ?? "").trim();
    const encryptedToken = String(shop.twilio_subaccount_auth_token ?? "").trim();

    // 3. Atalho: se já está connected, retorna imediatamente sem chamar a Twilio
    if (shop.waba_connect_status === "connected") {
      return jsonResponse({ success: true, status: "connected" });
    }

    if (!subaccountSid || !senderSid || !encryptedToken) {
      return jsonResponse({
        error: "Nenhuma conexão pendente encontrada. Inicie o processo de conexão novamente.",
        status: "not_connected",
      }, 409);
    }

    // 4. Decifra o Auth Token da subconta
    const subaccountAuthToken = await decryptWabaToken(encryptedToken);

    // 5. Consulta o status atual do Sender na Twilio Senders API
    // Conforme doc Twilio: "Allow several minutes between Senders API requests.
    // Too many requests in a short period might result in errors."
    // Polling definido como: intervalo de 15s no frontend, máximo 12 tentativas (3 minutos total).
    const res = await fetch(`https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`, {
      method: "GET",
      headers: {
        Authorization: twilioBasicAuth(subaccountSid, subaccountAuthToken),
      },
    });

    const resText = await res.text();
    let resData: Record<string, unknown> = {};
    try {
      resData = JSON.parse(resText);
    } catch {
      resData = { raw: resText };
    }

    if (!res.ok) {
      console.error("[waba-connect-check-status] Erro ao consultar Sender na Twilio:", resData);
      return jsonResponse({
        error: "Erro ao verificar status na Twilio. Tente novamente em instantes.",
        twilio_status: res.status,
      }, 502);
    }

    const senderStatus = String(resData.status ?? "").toUpperCase();

    console.log(`[waba-connect-check-status] Sender ${senderSid} status: ${senderStatus}`);

    // 6. Avalia o status retornado e atualiza o banco conforme necessário

    if (senderStatus === "ONLINE") {
      // Sender ativo: gravamos connected + waba_connected_at
      const { error: updateErr } = await serviceClient
        .from("barbershops")
        .update({
          waba_connect_status: "connected",
          waba_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", shopId);

      if (updateErr) {
        console.error("[waba-connect-check-status] Erro ao gravar connected no banco:", updateErr);
        return jsonResponse({ error: "Erro ao atualizar status no banco." }, 500);
      }

      return jsonResponse({
        success: true,
        status: "connected",
        message: "WhatsApp Business conectado com sucesso!",
      });
    }

    // Status OFFLINE ou CREATING: ainda aguardando ativação pela Meta/Twilio
    // O banco permanece em 'pending' — não é necessário atualizar nada
    return jsonResponse({
      success: true,
      status: "pending",
      sender_status: senderStatus,
      message: "Ativação em andamento. Aguarde alguns minutos.",
    });
  } catch (e) {
    console.error("[waba-connect-check-status] Erro interno:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
