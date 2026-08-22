/**
 * Lógica de negócio para processar uma resposta de paciente (Confirmar/Remarcar/Cancelar).
 * Consumida pelo worker process-whatsapp-webhook-jobs — não pelo webhook diretamente.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeBrazilPhoneE164Digits } from "./twilioWhatsapp.ts";
import { registrarUsoMensageria } from "./whatsappUsageLog.ts";
import { buildAppointmentAlertMessage } from "./appointmentAlertMessage.ts";
import { sendWhatsAppTemplateForBarbershop } from "./whatsappMessaging.ts";
import type { WhatsAppMessagingProvider } from "./barbershopMessagingProvider.ts";

export type InboundReplyPayload = {
  telefone: string;
  body: string;
  buttonPayload: string;
  provider?: WhatsAppMessagingProvider;
};

export type ProcessInboundReplyResult =
  | { ok: true; action: "confirmado" | "alerta" | "ignorado" | "sem_pendencia" }
  | { ok: false; error: string; retryable?: boolean };

type PendingMessageRow = {
  id: string;
  agendamento_id: string;
  barbearia_id: string;
};

type BarbeiroRef = { id: string; nome: string; whatsapp: string | null };

type AppointmentRow = {
  id: string;
  data: string;
  hora: string;
  cliente_nome: string;
  status: string;
  barbeiro_id: string | null;
  barbearia_id: string;
  barbeiros: BarbeiroRef | BarbeiroRef[] | null;
};

const ACTION_PREFIXES = ["confirmar", "remarcar", "cancelar"] as const;
type ParsedAction = (typeof ACTION_PREFIXES)[number];

const APPOINTMENT_SELECT =
  "id, data, hora, cliente_nome, status, barbeiro_id, barbearia_id, barbeiros(id, nome, whatsapp)";

function parseButtonPayload(payload: string): { action: ParsedAction; agendamentoId: string } | null {
  for (const prefix of ACTION_PREFIXES) {
    if (payload.startsWith(prefix)) {
      return { action: prefix, agendamentoId: payload.slice(prefix.length) };
    }
  }
  return null;
}

function parseBodyAction(body: string): ParsedAction | null {
  if (body === "Confirmar") return "confirmar";
  if (body === "Cancelar") return "cancelar";
  if (body === "Remarcar") return "remarcar";
  return null;
}

function barbeiroFromRow(row: AppointmentRow): BarbeiroRef | null {
  const value = row.barbeiros;
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function markOutboundMessageResponded(supabase: SupabaseClient, outboundMessageId: string) {
  await supabase
    .from("whatsapp_mensagens_enviadas")
    .update({ status: "respondida", respondido_em: new Date().toISOString() })
    .eq("id", outboundMessageId)
    .eq("status", "aguardando_resposta");
}

function logProcessamentoConcluido(params: { action: string; agendamentoId?: string; telefone?: string }) {
  if (params.agendamentoId) {
    console.log(
      `processamento concluído com sucesso | action=${params.action} | agendamento_id=${params.agendamentoId}`,
    );
  } else {
    console.log(
      `processamento concluído com sucesso | action=${params.action} | telefone=${params.telefone ?? "—"}`,
    );
  }
}

async function fetchPendingOutboundByPhone(
  supabase: SupabaseClient,
  telefoneDigits: string,
  provider: WhatsAppMessagingProvider,
) {
  return supabase
    .from("whatsapp_mensagens_enviadas")
    .select("id, agendamento_id, barbearia_id")
    .eq("telefone", telefoneDigits)
    .eq("provider", provider)
    .eq("status", "aguardando_resposta")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function fetchPendingOutboundByAppointment(
  supabase: SupabaseClient,
  agendamentoId: string,
  telefoneDigits: string,
  provider: WhatsAppMessagingProvider,
) {
  return supabase
    .from("whatsapp_mensagens_enviadas")
    .select("id, agendamento_id, barbearia_id")
    .eq("agendamento_id", agendamentoId)
    .eq("telefone", telefoneDigits)
    .eq("provider", provider)
    .eq("status", "aguardando_resposta")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
}

async function fetchAppointment(supabase: SupabaseClient, agendamentoId: string) {
  return supabase
    .from("agendamentos")
    .select(APPOINTMENT_SELECT)
    .eq("id", agendamentoId)
    .maybeSingle();
}

async function processConfirmAction(
  supabase: SupabaseClient,
  ag: AppointmentRow,
  outboundRow: PendingMessageRow | null,
): Promise<ProcessInboundReplyResult> {
  const { error: confirmError } = await supabase
    .from("agendamentos")
    .update({ client_confirmed_at: new Date().toISOString() })
    .eq("id", ag.id)
    .eq("status", "confirmado")
    .eq("requires_client_confirmation", true)
    .is("client_confirmed_at", null);

  if (confirmError) {
    return { ok: false, error: confirmError.message, retryable: true };
  }
  if (outboundRow) {
    await markOutboundMessageResponded(supabase, outboundRow.id);
  }
  logProcessamentoConcluido({ action: "confirmado", agendamentoId: ag.id });
  return { ok: true, action: "confirmado" };
}

async function processAlertAction(
  supabase: SupabaseClient,
  ag: AppointmentRow,
  outboundRow: PendingMessageRow | null,
  action: "cancelar" | "remarcar",
  inboundProvider: WhatsAppMessagingProvider,
): Promise<ProcessInboundReplyResult> {
  const tipo = action === "cancelar" ? "cancelamento" : "alteracao";
  const mensagem = buildAppointmentAlertMessage({
    tipo,
    clienteNome: ag.cliente_nome,
    data: ag.data,
    hora: ag.hora,
  });

  const { data: existingAlert } = await supabase
    .from("alertas_agendamento")
    .select("id, mensagem_profissional_enviada_em, billing_registrado_em, external_message_id, provider")
    .eq("agendamento_id", ag.id)
    .eq("tipo", tipo)
    .eq("status", "pendente")
    .maybeSingle();

  let alertId: string;

  if (existingAlert) {
    alertId = existingAlert.id;
  } else {
    const { data: inserted, error: alertError } = await supabase
      .from("alertas_agendamento")
      .insert({
        agendamento_id: ag.id,
        barbearia_id: ag.barbearia_id,
        barbeiro_id: ag.barbeiro_id,
        tipo,
        mensagem,
        provider: inboundProvider,
      })
      .select("id")
      .single();

    if (alertError) {
      return { ok: false, error: alertError.message, retryable: true };
    }
    alertId = inserted.id;
  }

  const { data: alertState, error: alertStateError } = await supabase
    .from("alertas_agendamento")
    .select("mensagem_profissional_enviada_em, billing_registrado_em, external_message_id, provider")
    .eq("id", alertId)
    .single();

  if (alertStateError) {
    return { ok: false, error: alertStateError.message, retryable: true };
  }

  const barbeiroWhatsapp = barbeiroFromRow(ag)?.whatsapp?.trim();
  if (!barbeiroWhatsapp) {
    console.error("processWhatsAppInboundReply: profissional sem WhatsApp cadastrado, alerta só no painel.");
    if (outboundRow) {
      await markOutboundMessageResponded(supabase, outboundRow.id);
    }
    logProcessamentoConcluido({ action: "alerta", agendamentoId: ag.id });
    return { ok: true, action: "alerta" };
  }

  let messageSent = Boolean(alertState?.mensagem_profissional_enviada_em);
  let billingDone = Boolean(alertState?.billing_registrado_em);
  const storedExternalMessageId = alertState?.external_message_id?.trim() || null;
  let externalMessageId: string | null = storedExternalMessageId;
  const alertProvider = (alertState?.provider as WhatsAppMessagingProvider | undefined) ?? inboundProvider;

  if (storedExternalMessageId && !messageSent) {
    console.info(
      "processWhatsAppInboundReply: external_message_id presente sem mensagem_profissional_enviada_em — tratando como enviada, pulando reenvio.",
    );
    const { error: repairTimestampError } = await supabase
      .from("alertas_agendamento")
      .update({ mensagem_profissional_enviada_em: new Date().toISOString() })
      .eq("id", alertId)
      .is("mensagem_profissional_enviada_em", null);

    if (repairTimestampError) {
      return { ok: false, error: repairTimestampError.message, retryable: true };
    }
    messageSent = true;
  }

  if (!messageSent) {
    try {
      const result = await sendWhatsAppTemplateForBarbershop(supabase, {
        to: barbeiroWhatsapp,
        templateKind: "alerta_profissional",
        variables: { mensagem },
        barbeariaId: ag.barbearia_id,
        overrideProvider: inboundProvider,
      });
      externalMessageId = result.externalMessageId;

      const sentAt = new Date().toISOString();
      const { error: markMessageError } = await supabase
        .from("alertas_agendamento")
        .update({
          mensagem_profissional_enviada_em: sentAt,
          external_message_id: result.externalMessageId,
          provider: result.provider,
        })
        .eq("id", alertId)
        .is("mensagem_profissional_enviada_em", null);

      if (markMessageError) {
        return { ok: false, error: markMessageError.message, retryable: true };
      }
      messageSent = true;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Falha ao notificar profissional";
      return { ok: false, error: message, retryable: true };
    }
  } else {
    console.info("processWhatsAppInboundReply: mensagem ao profissional já enviada, pulando reenvio (retry).");
  }

  if (!billingDone) {
    const billingResult = await registrarUsoMensageria(supabase, {
      barbeariaId: ag.barbearia_id,
      tipo: "alerta_profissional",
      profissionalId: ag.barbeiro_id,
      agendamentoId: ag.id,
      externalMessageId,
      provider: alertProvider,
    });

    if (!billingResult.ok) {
      return { ok: false, error: billingResult.error, retryable: true };
    }

    const { error: markBillingError } = await supabase
      .from("alertas_agendamento")
      .update({ billing_registrado_em: new Date().toISOString() })
      .eq("id", alertId)
      .is("billing_registrado_em", null);

    if (markBillingError) {
      return { ok: false, error: markBillingError.message, retryable: true };
    }
    billingDone = true;
  } else {
    console.info("processWhatsAppInboundReply: billing já registrado, pulando (retry).");
  }

  if (!messageSent || !billingDone) {
    return {
      ok: false,
      error: "Alerta ao profissional incompleto (mensagem ou billing pendente).",
      retryable: true,
    };
  }

  if (outboundRow) {
    await markOutboundMessageResponded(supabase, outboundRow.id);
  }
  logProcessamentoConcluido({ action: "alerta", agendamentoId: ag.id });
  return { ok: true, action: "alerta" };
}

async function finishIgnorado(
  supabase: SupabaseClient,
  outboundRow: PendingMessageRow | null,
  agendamentoId?: string,
  telefone?: string,
): Promise<ProcessInboundReplyResult> {
  if (outboundRow) {
    await markOutboundMessageResponded(supabase, outboundRow.id);
  }
  logProcessamentoConcluido({ action: "ignorado", agendamentoId, telefone });
  return { ok: true, action: "ignorado" };
}

export async function processWhatsAppInboundReply(
  supabase: SupabaseClient,
  payload: InboundReplyPayload,
): Promise<ProcessInboundReplyResult> {
  const telefoneDigits = normalizeBrazilPhoneE164Digits(payload.telefone);
  const body = payload.body.trim();
  const provider: WhatsAppMessagingProvider = payload.provider ?? "twilio";
  const parsedPayload = parseButtonPayload(payload.buttonPayload.trim());

  if (parsedPayload) {
    const { data: appointment, error: appointmentError } = await fetchAppointment(
      supabase,
      parsedPayload.agendamentoId,
    );

    if (appointmentError) {
      return { ok: false, error: appointmentError.message, retryable: true };
    }
    if (!appointment) {
      return finishIgnorado(supabase, null, parsedPayload.agendamentoId);
    }

    const ag = appointment as unknown as AppointmentRow;
    const { data: outbound, error: outboundError } = await fetchPendingOutboundByAppointment(
      supabase,
      parsedPayload.agendamentoId,
      telefoneDigits,
      provider,
    );

    if (outboundError) {
      return { ok: false, error: outboundError.message, retryable: true };
    }

    const outboundRow = (outbound as PendingMessageRow | null) ?? null;

    if (parsedPayload.action === "confirmar") {
      return processConfirmAction(supabase, ag, outboundRow);
    }
    if (parsedPayload.action === "cancelar" || parsedPayload.action === "remarcar") {
      return processAlertAction(supabase, ag, outboundRow, parsedPayload.action, provider);
    }

    return finishIgnorado(supabase, outboundRow, ag.id);
  }

  const bodyAction = parseBodyAction(body);
  const { data: pending, error: pendingError } = await fetchPendingOutboundByPhone(
    supabase,
    telefoneDigits,
    provider,
  );

  if (pendingError) {
    return { ok: false, error: pendingError.message, retryable: true };
  }
  if (!pending) {
    logProcessamentoConcluido({ action: "sem_pendencia", telefone: telefoneDigits });
    return { ok: true, action: "sem_pendencia" };
  }

  const outboundRow = pending as PendingMessageRow;

  const { data: appointment, error: appointmentError } = await fetchAppointment(
    supabase,
    outboundRow.agendamento_id,
  );

  if (appointmentError) {
    return { ok: false, error: appointmentError.message, retryable: true };
  }
  if (!appointment) {
    return finishIgnorado(supabase, outboundRow, outboundRow.agendamento_id);
  }

  const ag = appointment as unknown as AppointmentRow;

  if (!bodyAction) {
    return finishIgnorado(supabase, outboundRow, ag.id);
  }

  if (bodyAction === "confirmar") {
    return processConfirmAction(supabase, ag, outboundRow);
  }

  return processAlertAction(supabase, ag, outboundRow, bodyAction, provider);
}
