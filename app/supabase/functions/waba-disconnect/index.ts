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
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: shop, error: shopErr } = await serviceClient
      .from("barbershops")
      .select("id, sender_sid, twilio_subaccount_sid, twilio_subaccount_auth_token, waba_connect_status")
      .eq("owner_id", userId)
      .maybeSingle();

    if (shopErr) return jsonResponse({ error: shopErr.message }, 500);
    if (!shop) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    const shopId: string = shop.id;
    const senderSid = String(shop.sender_sid ?? "").trim();
    const subaccountSid = String(shop.twilio_subaccount_sid ?? "").trim();
    const encryptedToken = String(shop.twilio_subaccount_auth_token ?? "").trim();
    const currentStatus = String(shop.waba_connect_status ?? "");

    if (currentStatus === "not_connected" && !senderSid) {
      return jsonResponse({
        success: true,
        status: "not_connected",
        message: "WhatsApp já está desconectado.",
      });
    }

    if (senderSid) {
      if (!subaccountSid || !encryptedToken) {
        return jsonResponse({
          error: "Credenciais da subconta Twilio ausentes. Não foi possível remover o sender na Twilio.",
        }, 409);
      }

      const subaccountAuthToken = await decryptWabaToken(encryptedToken);

      const res = await fetch(`https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`, {
        method: "DELETE",
        headers: {
          Authorization: twilioBasicAuth(subaccountSid, subaccountAuthToken),
        },
      });

      if (!res.ok && res.status !== 404) {
        const resText = await res.text();
        let resData: Record<string, unknown> = {};
        try {
          resData = JSON.parse(resText);
        } catch {
          resData = { raw: resText };
        }
        console.error("[waba-disconnect] Falha ao deletar Sender na Twilio:", resData);
        return jsonResponse({
          error: (resData.message as string) || (resData.error as string) ||
            "Erro ao desconectar o número na Twilio. Tente novamente.",
        }, res.status === 504 ? 504 : 502);
      }
    }

    const { error: updateErr } = await serviceClient
      .from("barbershops")
      .update({
        waba_connect_status: "not_connected",
        waba_id: null,
        waba_phone_number_id: null,
        sender_sid: null,
        sender_phone_e164: null,
        waba_connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shopId);

    if (updateErr) {
      console.error("[waba-disconnect] Erro ao limpar estado no banco:", updateErr);
      return jsonResponse({ error: "Erro ao atualizar status no banco." }, 500);
    }

    return jsonResponse({
      success: true,
      status: "not_connected",
      message: "WhatsApp desconectado com sucesso.",
    });
  } catch (e) {
    console.error("[waba-disconnect] Erro interno:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
