import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  exchangeMpAuthorizationCode,
  getMpAppointmentsClientId,
  getMpAppointmentsClientSecret,
  isMpOAuthTestMode,
  mpOAuthRedirectUri,
  resolveAppOrigin,
} from "../_shared/mpOAuth.ts";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");

    const appOrigin = resolveAppOrigin(req.headers.get("origin"));
    const failRedirect = `${appOrigin}/app/pagamentos?mp=error`;
    const okRedirect = `${appOrigin}/app/pagamentos?mp=connected`;

    if (oauthError || !code || !state) {
      return Response.redirect(`${failRedirect}&reason=denied`, 302);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: stateData, error: stateErr } = await supabase.rpc("consume_mp_oauth_state", {
      p_state: state,
    });

    if (stateErr || !stateData || (stateData as { error?: string }).error) {
      console.error("mp-oauth-callback state:", stateErr, stateData);
      return Response.redirect(`${failRedirect}&reason=state`, 302);
    }

    const consumed = stateData as {
      shop_id: string;
      user_id: string;
      code_verifier: string;
    };

    const clientId = getMpAppointmentsClientId();
    const clientSecret = getMpAppointmentsClientSecret();
    const redirectUri = mpOAuthRedirectUri(supabaseUrl);

    const tokenPayload = await exchangeMpAuthorizationCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
      codeVerifier: consumed.code_verifier,
      testMode: isMpOAuthTestMode(),
    });

    const accessToken = String(tokenPayload.access_token ?? "");
    const refreshToken = String(tokenPayload.refresh_token ?? "");
    const expiresIn = Number(tokenPayload.expires_in ?? 15552000);
    const mpUserId = Number(tokenPayload.user_id ?? 0);
    const liveMode = tokenPayload.live_mode === true;

    if (!accessToken || !mpUserId) {
      console.error("mp-oauth-callback token missing fields:", tokenPayload);
      return Response.redirect(`${failRedirect}&reason=token`, 302);
    }

    const { error: saveErr } = await supabase.rpc("save_mp_oauth_tokens", {
      p_shop_id: consumed.shop_id,
      p_user_id: consumed.user_id,
      p_mp_user_id: mpUserId,
      p_access_token: accessToken,
      p_refresh_token: refreshToken || null,
      p_expires_in: expiresIn,
      p_live_mode: liveMode,
    });

    if (saveErr) {
      console.error("mp-oauth-callback save:", saveErr);
      return Response.redirect(`${failRedirect}&reason=save`, 302);
    }

    return Response.redirect(okRedirect, 302);
  } catch (e) {
    console.error("mp-oauth-callback:", e);
    const appOrigin = resolveAppOrigin(null);
    return Response.redirect(`${appOrigin}/app/pagamentos?mp=error&reason=server`, 302);
  }
});
