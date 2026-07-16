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
    return { ok: true, action: "ignorado" };
  }

  const ag = appointment as unknown as AppointmentRow;

  if (body === "Confirmar") {
    const { error: confirmError } = await supabase
      .from("agendamentos")
      .update({ client_confirmed_at: new Date().toISOString() })
      .eq("id", ag.id)
      .eq("status", "confirmado");

    if (confirmError) {
      return { ok: false, error: confirmError.message, retryable: true };
    }
    await markOutboundMessageResponded(supabase, row.id);
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
      .select("id, mensagem_profissional_enviada_em")
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

    const professionalMessageAlreadySent = Boolean(existingAlert?.mensagem_profissional_enviada_em);

    const barbeiroWhatsapp = barbeiroFromRow(ag)?.whatsapp?.trim();
    if (barbeiroWhatsapp && !professionalMessageAlreadySent) {
      const contentSid = Deno.env.get("TWILIO_CONTENT_SID_PROFESSIONAL_ALERT")?.trim();
      if (!contentSid) {
        console.error("processWhatsAppInboundReply: TWILIO_CONTENT_SID_PROFESSIONAL_ALERT não configurado.");
        await markOutboundMessageResponded(supabase, row.id);
        return { ok: true, action: "alerta" };
      }

      try {
        const result = await sendWhatsAppTemplate({
          to: barbeiroWhatsapp,
          contentSid,
          contentVariables: { "1": mensagem },
        });

        const sentAt = new Date().toISOString();
        const { error: markSentError } = await supabase
          .from("alertas_agendamento")
          .update({ mensagem_profissional_enviada_em: sentAt })
          .eq("id", alertId)
          .is("mensagem_profissional_enviada_em", null);

        if (markSentError) {
          return { ok: false, error: markSentError.message, retryable: true };
        }

        await registrarUsoMensageria(supabase, {
          barbeariaId: ag.barbearia_id,
          tipo: "alerta_profissional",
          profissionalId: ag.barbeiro_id,
          agendamentoId: ag.id,
          twilioMessageSid: result.sid,
        });
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : "Falha ao notificar profissional";
        return { ok: false, error: message, retryable: true };
      }
    } else if (barbeiroWhatsapp && professionalMessageAlreadySent) {
      console.info("processWhatsAppInboundReply: mensagem ao profissional já enviada, pulando reenvio (retry).");
    } else {
      console.error("processWhatsAppInboundReply: profissional sem WhatsApp cadastrado, alerta só no painel.");
    }

    await markOutboundMessageResponded(supabase, row.id);
    return { ok: true, action: "alerta" };
  }

  await markOutboundMessageResponded(supabase, row.id);
  return { ok: true, action: "ignorado" };
}
