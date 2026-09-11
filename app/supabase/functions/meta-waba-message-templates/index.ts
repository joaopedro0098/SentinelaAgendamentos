import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createOrResubmitWabaTemplate,
  linkWabaTemplate,
  resolveMetaShopForOwner,
  syncWabaTemplates,
} from "../_shared/metaWabaTemplatesService.ts";
import type { SentinelaTemplateCategory } from "../_shared/metaTemplateProduct.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseCategory(value: unknown): SentinelaTemplateCategory | null {
  if (value === "confirmacao" || value === "lembrete") return value;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Não autenticado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ ok: false, error: "Sessão inválida." }, 401);
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const shopResult = await resolveMetaShopForOwner(serviceClient, userData.user.id);
    if (!shopResult.ok) {
      return json({ ok: false, error: shopResult.error }, shopResult.status);
    }

    const ctx = shopResult.ctx;

    if (action === "sync") {
      const result = await syncWabaTemplates(serviceClient, ctx);
      return json(result);
    }

    if (action === "link") {
      const category = parseCategory(body.sentinela_category);
      if (!category) return json({ ok: false, error: "Categoria inválida." }, 422);

      const result = await linkWabaTemplate(serviceClient, ctx, {
        meta_template_id: String(body.meta_template_id ?? ""),
        meta_template_name: String(body.meta_template_name ?? ""),
        language: String(body.language ?? ""),
        sentinela_category: category,
        body_display_text: body.body_display_text != null ? String(body.body_display_text) : undefined,
        quick_reply_labels: Array.isArray(body.quick_reply_labels)
          ? body.quick_reply_labels.map(String)
          : undefined,
      });

      if (result.ok === false) return json(result, 422);
      return json(result);
    }

    if (action === "create" || action === "resubmit") {
      const category = parseCategory(body.sentinela_category);
      if (!category) return json({ ok: false, error: "Categoria inválida." }, 422);

      const enabledIds = Array.isArray(body.enabled_button_ids)
        ? body.enabled_button_ids.map(String)
        : [];

      const result = await createOrResubmitWabaTemplate(serviceClient, ctx, {
        sentinela_category: category,
        body_display_text: String(body.body_display_text ?? ""),
        language: String(body.language ?? ""),
        enabled_button_ids: enabledIds,
      });

      if (result.ok === false) return json(result, 422);
      return json(result);
    }

    return json({ ok: false, error: "Ação inválida." }, 400);
  } catch (e) {
    console.error("[meta-waba-message-templates]", e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Erro interno." },
      500,
    );
  }
});
