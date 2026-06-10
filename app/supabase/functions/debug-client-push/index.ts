import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET")?.trim();
  const requestSecret =
    req.headers.get("x-cron-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (cronSecret && requestSecret === cronSecret) return true;

  const payload = decodeJwtPayload(requestSecret);
  if (payload?.role === "service_role") return true;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (serviceKey && requestSecret === serviceKey) return true;

  return false;
}

function maskEndpoint(endpoint: string) {
  return endpoint.length > 60 ? `${endpoint.slice(0, 60)}...` : endpoint;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não permitido" }, 405);

  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Não autorizado." }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const agendamentoId = String(body.agendamento_id ?? "").trim();
    if (!agendamentoId) {
      return jsonResponse({ error: "agendamento_id é obrigatório." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: appointment, error: appointmentError } = await supabase
      .from("agendamentos")
      .select(
        "id, barbearia_id, cliente_nome, cliente_whatsapp, cliente_id, origem, status, data, hora, requires_client_confirmation, client_confirmed_at, confirmation_push_sent_at, created_at",
      )
      .eq("id", agendamentoId)
      .maybeSingle();

    if (appointmentError) return jsonResponse({ error: appointmentError.message }, 500);
    if (!appointment) return jsonResponse({ error: "Agendamento não encontrado." }, 404);

    const { data: ownSubs } = await supabase
      .from("appointment_push_subscriptions")
      .select("id, endpoint, failed_at, failure_reason, last_success_at, created_at")
      .eq("agendamento_id", agendamentoId);

    // Todos os agendamentos da barbearia (até 50 mais recentes) com whatsapp/cliente e subscriptions.
    const { data: siblings } = await supabase
      .from("agendamentos")
      .select("id, cliente_nome, cliente_whatsapp, cliente_id, origem, status, data, hora, created_at")
      .eq("barbearia_id", appointment.barbearia_id)
      .neq("id", agendamentoId)
      .order("created_at", { ascending: false })
      .limit(50);

    const siblingIds = (siblings ?? []).map((row) => row.id);
    const { data: siblingSubs } = siblingIds.length
      ? await supabase
          .from("appointment_push_subscriptions")
          .select("id, agendamento_id, endpoint, failed_at, failure_reason, last_success_at, created_at")
          .in("agendamento_id", siblingIds)
      : { data: [] as Record<string, unknown>[] };

    const targetDigits = String(appointment.cliente_whatsapp ?? "").replace(/\D/g, "");

    const siblingsReport = (siblings ?? []).map((row) => {
      const rowDigits = String(row.cliente_whatsapp ?? "").replace(/\D/g, "");
      const whatsappExact = rowDigits === targetDigits && rowDigits.length > 0;
      const whatsappLast11 =
        rowDigits.length >= 10 &&
        targetDigits.length >= 10 &&
        rowDigits.slice(-11) === targetDigits.slice(-11);
      const clienteIdMatch =
        Boolean(appointment.cliente_id) && row.cliente_id === appointment.cliente_id;

      const subs = ((siblingSubs ?? []) as Record<string, unknown>[])
        .filter((sub) => sub.agendamento_id === row.id)
        .map((sub) => ({
          id: sub.id,
          endpoint: maskEndpoint(String(sub.endpoint ?? "")),
          failed_at: sub.failed_at,
          failure_reason: sub.failure_reason,
          last_success_at: sub.last_success_at,
          created_at: sub.created_at,
        }));

      return {
        id: row.id,
        cliente_nome: row.cliente_nome,
        cliente_whatsapp: row.cliente_whatsapp,
        cliente_id: row.cliente_id,
        origem: row.origem,
        status: row.status,
        data: row.data,
        hora: row.hora,
        created_at: row.created_at,
        match_whatsapp_exact: whatsappExact,
        match_whatsapp_last11: whatsappLast11,
        match_cliente_id: clienteIdMatch,
        inheritable: (whatsappExact || whatsappLast11 || clienteIdMatch) &&
          subs.some((sub) => sub.failed_at === null),
        subscriptions: subs,
      };
    });

    const { data: inheritResult, error: inheritError } = await supabase.rpc(
      "inherit_appointment_push_subscription",
      { _agendamento_id: agendamentoId, _force_refresh: true },
    );

    const { data: subsAfter } = await supabase
      .from("appointment_push_subscriptions")
      .select("id, endpoint, failed_at, failure_reason, last_success_at, created_at")
      .eq("agendamento_id", agendamentoId);

    return jsonResponse({
      ok: true,
      appointment: {
        ...appointment,
        cliente_whatsapp_digits: targetDigits,
      },
      own_subscriptions_before: (ownSubs ?? []).map((sub) => ({
        ...sub,
        endpoint: maskEndpoint(String(sub.endpoint ?? "")),
      })),
      inherit_attempt: {
        result: inheritResult ?? null,
        error: inheritError?.message ?? null,
      },
      own_subscriptions_after: (subsAfter ?? []).map((sub) => ({
        ...sub,
        endpoint: maskEndpoint(String(sub.endpoint ?? "")),
      })),
      siblings_in_barbearia: siblingsReport,
    });
  } catch (error) {
    console.error("debug-client-push:", error);
    return jsonResponse({ error: "Falha no diagnóstico." }, 500);
  }
});
