import {
  createServiceClient,
  finalizeExpiredPaymentHoldsBatch,
} from "../_shared/mpAppointment.ts";

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
    const authHeader = req.headers.get("Authorization") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!authHeader.includes(serviceKey)) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    let limit = 25;
    try {
      const body = await req.json();
      if (typeof body?.limit === "number") limit = body.limit;
    } catch {
      /* cron pode chamar sem body */
    }

    const supabase = createServiceClient();
    const stats = await finalizeExpiredPaymentHoldsBatch(supabase, limit);
    return jsonResponse({ ok: true, ...stats });
  } catch (e) {
    console.error("mp-finalize-expired-payment-holds:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
