import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { backfillApprovedTemplateTtl } from "../_shared/metaWabaTemplatesService.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!serviceKey) {
    return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY não configurada." }, 500);
  }

  const auth = req.headers.get("Authorization")?.trim() ?? "";
  if (auth !== `Bearer ${serviceKey}`) {
    return json({ ok: false, error: "Não autorizado." }, 401);
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const localTemplateId = body.local_template_id != null ? String(body.local_template_id).trim() : "";
    const barbershopId = body.barbershop_id != null ? String(body.barbershop_id).trim() : "";
    const allShops = body.all_shops === true;
    const dryRun = body.dry_run === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const result = await backfillApprovedTemplateTtl(serviceClient, {
      localTemplateId: localTemplateId || undefined,
      barbershopId: barbershopId || undefined,
      allShops,
      dryRun,
    });

    const patched = result.outcomes.filter((o) => o.patched).length;
    const skipped = result.outcomes.filter((o) => o.skipped).length;
    const failed = result.outcomes.filter((o) => o.error).length;

    return json({
      ok: failed === 0,
      dry_run: dryRun,
      summary: { total: result.outcomes.length, patched, skipped, failed },
      outcomes: result.outcomes,
    });
  } catch (e) {
    console.error("[meta-waba-template-ttl-backfill]", e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Erro interno." },
      500,
    );
  }
});
