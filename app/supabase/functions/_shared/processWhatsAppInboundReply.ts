/**
 * Lógica de negócio para processar uma resposta de paciente (Confirmar/Alterar/Cancelar).
 * Consumida pelo worker process-whatsapp-webhook-jobs — não pelo webhook diretamente.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendWhatsAppTemplate } from "./twilioWhatsapp.ts";
import { registrarUsoMensageria } from "./whatsappUsageLog.ts";
import { buildAppointmentAlertMessage } from "./appointmentAlertMessage.ts";

export type InboundReplyPayload = {
  telefone: string;
  body: string;
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

export async function processWhatsAppInboundReply(
  supabase: SupabaseClient,
  payload: InboundReplyPayload,
): Promise<ProcessInboundReplyResult> {
  const telefoneDigits = payload.telefone;
  const body = payload.body.trim();

  const { data: pending, error: pendingError } = await supabase
    .from("whatsapp_mensagens_enviadas")
    .select("id, agendamento_id, barbearia_id")
    .eq("telefone", telefoneDigits)
    .eq("status", "aguardando_resposta")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingError) {
    return { ok: false, error: pendingError.message, retryable: true };
  }
  if (!pending) {
    logProcessamentoConcluido({ action: "sem_pendencia", telefone: telefoneDigits });
    return { ok: true, action: "sem_pendencia" };
  }

  const row = pending as PendingMessageRow;

  const { data: appointment, error: appointmentError } = await supabase
    .from("agendamentos")
    .select("id, data, hora, cliente_nome, status, barbeiro_id, barbearia_id, barbeiros(id, nome, whatsapp)")
    .eq("id", row.agendamento_id)
    .maybeSingle();

  if (appointmentError) {
    return { ok: false, error: appointmentError.message, retryable: true };
  }
  if (!appointment) {
    await markOutboundMessageResponded(supabase, row.id);
    logProcessamentoConcluido({ action: "ignorado", agendamentoId: row.agendamento_id });
    return { ok: true, action: "ignorado" };
  }

  const ag = appointment as unknown as AppointmentRow;

  if (body === "Confirmar") {
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
    await markOutboundMessageResponded(supabase, row.id);
    logProcessamentoConcluido({ action: "confirmado", agendamentoId: ag.id });
    return { ok: true, action: "confirmado" };
  }

  if (body === "Cancelar" || body === "Alterar") {
    const tipo = body === "Cancelar" ? "cancelamento" : "alteracao";
    const mensagem = buildAppointmentAlertMessage({
      tipo,
      clienteNome: ag.cliente_nome,
      data: ag.data,
      hora: ag.hora,
    });

    const { data: existingAlert } = await supabase
      .from("alertas_agendamento")
      .select("id, mensagem_profissional_enviada_em, billing_registrado_em, twilio_message_sid")
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
      .select("mensagem_profissional_enviada_em, billing_registrado_em, twilio_message_sid")
      .eq("id", alertId)
      .single();

    if (alertStateError) {
      return { ok: false, error: alertStateError.message, retryable: true };
    }

    const barbeiroWhatsapp = barbeiroFromRow(ag)?.whatsapp?.trim();
    if (!barbeiroWhatsapp) {
      console.error("processWhatsAppInboundReply: profissional sem WhatsApp cadastrado, alerta só no painel.");
      await markOutboundMessageResponded(supabase, row.id);
      logProcessamentoConcluido({ action: "alerta", agendamentoId: ag.id });
      return { ok: true, action: "alerta" };
    }

    const contentSid = Deno.env.get("TWILIO_CONTENT_SID_PROFESSIONAL_ALERT")?.trim();
    if (!contentSid) {
      console.error("processWhatsAppInboundReply: TWILIO_CONTENT_SID_PROFESSIONAL_ALERT não configurado.");
      await markOutboundMessageResponded(supabase, row.id);
      logProcessamentoConcluido({ action: "alerta", agendamentoId: ag.id });
      return { ok: true, action: "alerta" };
    }

    let messageSent = Boolean(alertState?.mensagem_profissional_enviada_em);
    let billingDone = Boolean(alertState?.billing_registrado_em);
    const storedTwilioSid = alertState?.twilio_message_sid?.trim() || null;
    let twilioMessageSid: string | null = storedTwilioSid;

    if (storedTwilioSid && !messageSent) {
      console.info(
        "processWhatsAppInboundReply: twilio_message_sid presente sem mensagem_profissional_enviada_em — tratando como enviada, pulando reenvio.",
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
        const result = await sendWhatsAppTemplate({
          to: barbeiroWhatsapp,
          contentSid,
          contentVariables: { "1": mensagem },
        });
        twilioMessageSid = result.sid;

        const sentAt = new Date().toISOString();
        const { error: markMessageError } = await supabase
          .from("alertas_agendamento")
          .update({
            mensagem_profissional_enviada_em: sentAt,
            twilio_message_sid: result.sid,
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
        twilioMessageSid,
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

    await markOutboundMessageResponded(supabase, row.id);
    logProcessamentoConcluido({ action: "alerta", agendamentoId: ag.id });
    return { ok: true, action: "alerta" };
  }

  await markOutboundMessageResponded(supabase, row.id);
  logProcessamentoConcluido({ action: "ignorado", agendamentoId: ag.id });
  return { ok: true, action: "ignorado" };
}
