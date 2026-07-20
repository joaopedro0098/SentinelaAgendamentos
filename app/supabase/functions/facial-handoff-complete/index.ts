import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { broadcastFacialHandoffCompleted } from "../_shared/facialHandoffBroadcast.ts";

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

function isEmbedding128(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 128 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      session_id?: string;
      embedding?: number[];
    };

    const sessionId = body.session_id?.trim();
    if (!sessionId || !isEmbedding128(body.embedding)) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("complete_facial_handoff_session", {
      p_session_id: sessionId,
      p_embedding: body.embedding,
    });

    if (error) {
      console.error("complete_facial_handoff_session:", error.message);
      return jsonResponse({ ok: false, error: "server_error" }, 500);
    }

    const row = data as {
      ok?: boolean;
      error?: string;
      trial_eligible?: boolean;
      facial_match?: boolean;
    };

    if (!row?.ok) {
      const code = row?.error ?? "failed";
      try {
        await broadcastFacialHandoffCompleted(supabase, {
          session_id: sessionId,
          status: "failed",
          error_code: code,
        });
      } catch (broadcastErr) {
        console.error("facial-handoff broadcast (failed):", broadcastErr);
      }
      return jsonResponse({ ok: false, error: code }, 400);
    }

    try {
      await broadcastFacialHandoffCompleted(supabase, {
        session_id: sessionId,
        status: "completed",
      });
    } catch (broadcastErr) {
      console.error("facial-handoff broadcast (completed):", broadcastErr);
    }

    return jsonResponse({
      ok: true,
      trial_eligible: row.trial_eligible,
      facial_match: row.facial_match,
    });
  } catch (e) {
    console.error("facial-handoff-complete:", e);
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
});
