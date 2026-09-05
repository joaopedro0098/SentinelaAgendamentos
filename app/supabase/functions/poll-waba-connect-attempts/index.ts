/**
 * Worker cron: polling de segurança para tentativas Embedded Signup sem postMessage.
 * Invocado a cada 2 minutos (invoke_poll_waba_connect_attempts_cron).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isCronAuthorized } from "../_shared/cronAuth.ts";
import {
  completeMetaWabaConnect,
  fetchClientWhatsappBusinessAccounts,
  fetchKnownWabaIdsFromDb,
  fetchWabaPhoneNumbers,
  getMetaPartnerPollingConfig,
  matchNewWabaForAttempt,
  parseFlowType,
  pickPhoneNumberIdForConnect,
  type WabaConnectAttemptRow,
} from "../_shared/metaWabaConnect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseSnapshot(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!isCronAuthorized(req)) {
      return jsonResponse({ error: "Não autorizado." }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();

    await supabase
      .from("waba_connect_attempts")
      .update({
        status: "expired",
        error_message: "attempt_ttl_exceeded",
        updated_at: nowIso,
      })
      .in("status", ["pending", "code_received"])
      .lt("expires_at", nowIso);

    const { data: openAttempts, error: openErr } = await supabase
      .from("waba_connect_attempts")
      .select("*")
      .in("status", ["pending", "code_received"])
      .gte("expires_at", nowIso)
      .order("started_at", { ascending: true });

    if (openErr) {
      return jsonResponse({ error: openErr.message }, 500);
    }

    const attempts = (openAttempts ?? []) as WabaConnectAttemptRow[];
    if (attempts.length === 0) {
      return jsonResponse({ ok: true, processed: 0, message: "Nenhuma tentativa em aberto." });
    }

    const partner = getMetaPartnerPollingConfig();
    if (!partner.configured) {
      console.warn(
        "[poll-waba-connect-attempts] META_PARTNER_BUSINESS_ID ou META_SYSTEM_USER_ACCESS_TOKEN ausentes; polling Graph API ignorado.",
      );
      return jsonResponse({
        ok: true,
        processed: 0,
        open_attempts: attempts.length,
        warning: "partner_polling_env_missing",
      });
    }

    const portfolioWabas = await fetchClientWhatsappBusinessAccounts(
      partner.systemUserAccessToken!,
      partner.partnerBusinessId!,
    );

    const dbKnownIds = new Set(await fetchKnownWabaIdsFromDb(supabase));
    const openAttemptsCount = attempts.length;

    let completed = 0;
    let ambiguous = 0;
    let awaitingPhone = 0;
    const errors: Array<{ attempt_id: string; error: string }> = [];

    for (const attempt of attempts) {
      const snapshotIds = parseSnapshot(attempt.known_waba_ids_snapshot);
      const knownIds = new Set([...dbKnownIds, ...snapshotIds]);

      const match = matchNewWabaForAttempt(attempt, portfolioWabas, knownIds, openAttemptsCount);

      if (match.kind === "ambiguous") {
        ambiguous += 1;
        const msg =
          `AMBIGUO: não auto-conectar shop=${attempt.shop_id} attempt=${attempt.id} reason=${match.reason} candidates=[${match.candidateWabaIds.join(",")}]`;
        console.warn(`[poll-waba-connect-attempts] ${msg}`);
        await supabase
          .from("waba_connect_attempts")
          .update({
            status: "ambiguous",
            error_message: msg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", attempt.id);
        continue;
      }

      if (match.kind === "none") {
        continue;
      }

      const wabaId = match.wabaId;
      const flowType = parseFlowType(String(attempt.discovered_flow_type ?? "")) ?? "new_phone_number";

      try {
        let phoneNumberId = String(attempt.discovered_phone_number_id ?? "").trim();

        if (!phoneNumberId && flowType !== "existing_phone_number") {
          const phones = await fetchWabaPhoneNumbers(partner.systemUserAccessToken!, wabaId);
          phoneNumberId = pickPhoneNumberIdForConnect(phones, flowType) ?? "";
          if (!phoneNumberId) {
            awaitingPhone += 1;
            await supabase
              .from("waba_connect_attempts")
              .update({
                discovered_waba_id: wabaId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", attempt.id);
            continue;
          }
        }

        const result = await completeMetaWabaConnect({
          serviceClient: supabase,
          shopId: attempt.shop_id,
          wabaId,
          phoneNumberId,
          flowType,
          accessToken: partner.systemUserAccessToken!,
          businessId: attempt.discovered_business_id,
          completedVia: "cron_poll",
          attemptId: attempt.id,
        });

        if (result.ok) {
          completed += 1;
          dbKnownIds.add(wabaId);
          console.log(
            `[poll-waba-connect-attempts] conectado shop=${attempt.shop_id} waba=${wabaId} reason=${match.reason}`,
          );
        } else if (result.status === "provisioning") {
          console.log(
            `[poll-waba-connect-attempts] provisioning em andamento shop=${attempt.shop_id} attempt=${attempt.id}`,
          );
        } else {
          errors.push({ attempt_id: attempt.id, error: result.error });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        errors.push({ attempt_id: attempt.id, error: errMsg });
        console.error(`[poll-waba-connect-attempts] erro attempt=${attempt.id}:`, e);
      }
    }

    return jsonResponse({
      ok: true,
      open_attempts: attempts.length,
      completed,
      ambiguous,
      awaiting_phone: awaitingPhone,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[poll-waba-connect-attempts] Erro interno:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Falha no polling de tentativas WABA.",
    }, 500);
  }
});
