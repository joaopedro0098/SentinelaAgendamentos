import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeBrazilPhoneE164Digits } from "../_shared/twilioWhatsapp.ts";
import { resolveExtensionConnectUser } from "../_shared/extensionConnectAuth.ts";
import { extensionConnectCorsHeaders, jsonResponse } from "../_shared/extensionConnectHttp.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: extensionConnectCorsHeaders(req) });
  }

  if (req.method !== "GET" && req.method !== "POST") {
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

  if (action === "ping") {
    return jsonResponse(req, { ok: true, user_id: auth.userId });
  }

  if (action === "templates") {
    const { data, error } = await supabase.rpc("extension_connect_list_message_templates", {
      p_user_id: auth.userId,
    });
    if (error) {
      console.error("extension_connect_list_message_templates:", error.message);
      return jsonResponse(req, { error: "Falha ao carregar mensagens." }, 500);
    }
    return jsonResponse(req, (data ?? {}) as Record<string, unknown>);
  }

  if (req.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, { error: "JSON inválido." }, 400);
    }

    const postAction = String(body.action ?? "").trim();

    if (postAction === "save_template") {
      const { data, error } = await supabase.rpc("extension_connect_upsert_message_template", {
        p_user_id: auth.userId,
        p_id: body.id ? String(body.id) : null,
        p_label: String(body.label ?? ""),
        p_body: String(body.body ?? ""),
      });
      if (error) {
        console.error("extension_connect_upsert_message_template:", error.message);
        return jsonResponse(req, { error: "Falha ao salvar mensagem." }, 500);
      }
      const payload = (data ?? {}) as Record<string, unknown>;
      if (payload.error) return jsonResponse(req, payload, 400);
      return jsonResponse(req, payload);
    }

    if (postAction === "delete_template") {
      const { data, error } = await supabase.rpc("extension_connect_delete_message_template", {
        p_user_id: auth.userId,
        p_id: String(body.id ?? ""),
      });
      if (error) {
        console.error("extension_connect_delete_message_template:", error.message);
        return jsonResponse(req, { error: "Falha ao excluir mensagem." }, 500);
      }
      const payload = (data ?? {}) as Record<string, unknown>;
      if (payload.error) return jsonResponse(req, payload, 400);
      return jsonResponse(req, payload);
    }

    return jsonResponse(req, { error: "Ação inválida." }, 400);
  }

  const rawPhone = url.searchParams.get("phone")?.trim() ?? "";
  const displayName = url.searchParams.get("display_name")?.trim() ?? "";
  if (!rawPhone) {
    return jsonResponse(req, { error: "Parâmetro phone é obrigatório." }, 400);
  }

  const phoneDigits = normalizeBrazilPhoneE164Digits(rawPhone);
  if (phoneDigits.length < 10 || phoneDigits.length > 13) {
    return jsonResponse(req, {
      error: "invalid_phone",
      phone_digits: phoneDigits,
    }, 400);
  }

  const { data, error } = await supabase.rpc("extension_connect_client_lookup", {
    p_user_id: auth.userId,
    p_phone: phoneDigits,
    p_display_name: displayName || null,
  });

  if (error) {
    console.error("extension_connect_client_lookup:", error.message);
    return jsonResponse(req, { error: "Falha ao buscar paciente." }, 500);
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) {
    return jsonResponse(req, payload, 400);
  }
  return jsonResponse(req, payload);
});
