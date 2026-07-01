import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildMpAuthorizationUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  getMpAppointmentsClientId,
  getMpAppointmentsClientSecret,
  mpOAuthRedirectUri,
} from "../_shared/mpOAuth.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Sessão inválida." }, 401);
    }

    const clientId = getMpAppointmentsClientId();
    const clientSecret = getMpAppointmentsClientSecret();
    if (!clientId || !clientSecret) {
      return jsonResponse({ error: "Mercado Pago (agendamentos) não configurado no servidor." }, 503);
    }

    const { data: panel, error: panelErr } = await userClient.rpc("get_payment_panel_settings");
    if (panelErr) return jsonResponse({ error: panelErr.message }, 500);

    const panelObj = panel as Record<string, unknown> | null;
    if (panelObj?.ca_readonly === true) {
      return jsonResponse({ error: String(panelObj.readonly_message ?? "Pagamentos centralizados.") }, 403);
    }

    const shopId = String(panelObj?.shop_id ?? "");
    if (!shopId) return jsonResponse({ error: "Empresa não encontrada." }, 404);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateOAuthState();
    const redirectUri = mpOAuthRedirectUri(supabaseUrl);

    const { error: stateErr } = await userClient.rpc("create_mp_oauth_state", {
      p_shop_id: shopId,
      p_state: state,
      p_code_verifier: codeVerifier,
    });

    if (stateErr) return jsonResponse({ error: stateErr.message }, 500);

    const url = buildMpAuthorizationUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    });

    return jsonResponse({ url, state, redirect_uri: redirectUri });
  } catch (e) {
    console.error("mp-oauth-start:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
