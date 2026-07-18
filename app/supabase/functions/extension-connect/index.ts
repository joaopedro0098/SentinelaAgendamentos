import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeBrazilPhoneE164Digits } from "../_shared/twilioWhatsapp.ts";
import { resolveExtensionConnectUser } from "../_shared/extensionConnectAuth.ts";
import { extensionConnectCorsHeaders, getAppBaseUrl, jsonResponse } from "../_shared/extensionConnectHttp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: extensionConnectCorsHeaders(req) });
  }

  if (req.method !== "GET") {
    return jsonResponse(req, { error: "Método não permitido." }, 405);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action")?.trim() || "lookup";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = await resolveExtensionConnectUser(supabase, req);
  if (!auth.ok) {
    return jsonResponse(req, { error: auth.message }, auth.status);
  }

  const appBase = getAppBaseUrl();
  const links = {
    panel_base: `${appBase}/app/agendamentos`,
    pacientes: `${appBase}/app/pacientes`,
    agendar: `${appBase}/app/agendar`,
  };

  if (action === "ping") {
    return jsonResponse(req, { ok: true, user_id: auth.userId, links });
  }

  const rawPhone = url.searchParams.get("phone")?.trim() ?? "";
  if (!rawPhone) {
    return jsonResponse(req, { error: "Parâmetro phone é obrigatório." }, 400);
  }

  const phoneDigits = normalizeBrazilPhoneE164Digits(rawPhone);
  if (phoneDigits.length < 10) {
    return jsonResponse(req, {
      found: false,
      error: "invalid_phone",
      phone_digits: phoneDigits,
      matches: [],
      links,
    });
  }

  const { data, error } = await supabase.rpc("extension_connect_client_lookup", {
    p_user_id: auth.userId,
    p_phone: phoneDigits,
  });

  if (error) {
    console.error("extension_connect_client_lookup:", error.message);
    return jsonResponse(req, { error: "Falha ao buscar paciente." }, 500);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  return jsonResponse(req, {
    ...payload,
    links,
  });
});
