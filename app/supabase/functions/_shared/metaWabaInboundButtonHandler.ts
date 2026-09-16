/**
 * Clique em quick reply (template Meta) — provider meta only.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizeBrazilPhoneE164Digits, phoneDigitsFromWhatsAppAddress } from "./whatsappPhone.ts";
import { CATEGORY_BUTTON_OPTIONS, type TemplateLanguage } from "./metaTemplateProduct.ts";
import { buildAppointmentAlertMessage } from "./appointmentAlertMessage.ts";

type ConfirmAction = "confirmar" | "remarcar" | "cancelar";

type OutboundRow = {
  id: string;
  agendamento_id: string;
  barbearia_id: string;
};

const APPOINTMENT_SELECT =
  "id, data, hora, cliente_nome, status, barbeiro_id, barbearia_id, requires_client_confirmation, client_confirmed_at";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function actionFromButtonLabel(raw: string): ConfirmAction | null {
  const normalized = normalizeLabel(raw);
  if (!normalized) return null;

  for (const category of ["confirmacao", "lembrete"] as const) {
    for (const opt of CATEGORY_BUTTON_OPTIONS[category]) {
      for (const lang of Object.keys(opt.label) as TemplateLanguage[]) {
        if (normalizeLabel(opt.label[lang]) === normalized) {
          return opt.id as ConfirmAction;
        }
      }
    }
  }

  if (normalized === "confirm" || normalized.startsWith("confirm")) return "confirmar";
  if (normalized === "cancel" || normalized.startsWith("cancel")) return "cancelar";
  if (normalized.includes("remarc") || normalized.includes("resched") || normalized.includes("reprogram")) {
    return "remarcar";
  }

  return null;
}

async function markOutboundResponded(supabase: SupabaseClient, outboundId: string) {
  await supabase
    .from("whatsapp_mensagens_enviadas")
    .update({ status: "respondida", respondido_em: new Date().toISOString() })
    .eq("id", outboundId)
    .eq("status", "aguardando_resposta");
}

async function findOutboundByContextWamid(
  supabase: SupabaseClient,
  contextWamid: string,
): Promise<OutboundRow | null> {
  const { data, error } = await supabase
    .from("whatsapp_mensagens_enviadas")
    .select("id, agendamento_id, barbearia_id")
    .eq("provider", "meta")
    .eq("external_message_id", contextWamid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as OutboundRow | null) ?? null;
}

async function findOutboundByPhonePending(
  supabase: SupabaseClient,
  phoneDigits: string,
): Promise<OutboundRow | null> {
  const { data, error } = await supabase
    .from("whatsapp_mensagens_enviadas")
    .select("id, agendamento_id, barbearia_id")
    .eq("provider", "meta")
    .eq("telefone", phoneDigits)
    .eq("status", "aguardando_resposta")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as OutboundRow | null) ?? null;
}

async function confirmAppointment(
  supabase: SupabaseClient,
  agendamentoId: string,
  outbound: OutboundRow | null,
): Promise<void> {
  const { error } = await supabase
    .from("agendamentos")
    .update({ client_confirmed_at: new Date().toISOString() })
    .eq("id", agendamentoId)
    .eq("status", "confirmado")
    .eq("requires_client_confirmation", true)
    .is("client_confirmed_at", null);

  if (error) throw new Error(error.message);
  if (outbound) await markOutboundResponded(supabase, outbound.id);
}

async function createPanelAlert(
  supabase: SupabaseClient,
  agendamentoId: string,
  action: "cancelar" | "remarcar",
  outbound: OutboundRow | null,
): Promise<void> {
  const { data: ag, error: agErr } = await supabase
    .from("agendamentos")
    .select(APPOINTMENT_SELECT)
    .eq("id", agendamentoId)
    .maybeSingle();

  if (agErr) throw new Error(agErr.message);
  if (!ag) return;

  const tipo = action === "cancelar" ? "cancelamento" : "alteracao";
  const mensagem = buildAppointmentAlertMessage({
    tipo,
    clienteNome: String(ag.cliente_nome ?? ""),
    data: String(ag.data),
    hora: String(ag.hora).slice(0, 5),
  });

  const { data: existing } = await supabase
    .from("alertas_agendamento")
    .select("id")
    .eq("agendamento_id", agendamentoId)
    .eq("tipo", tipo)
    .eq("status", "pendente")
    .maybeSingle();

  if (!existing?.id) {
    const { error: insErr } = await supabase.from("alertas_agendamento").insert({
      agendamento_id: agendamentoId,
      barbearia_id: ag.barbearia_id,
      barbeiro_id: ag.barbeiro_id,
      tipo,
      mensagem,
      provider: "meta",
    });
    if (insErr) throw new Error(insErr.message);
  }

  if (outbound) await markOutboundResponded(supabase, outbound.id);
}

export async function processMetaInboundButtonMessage(
  supabase: SupabaseClient,
  params: {
    phoneNumberId: string;
    fromPhone: string;
    contextWamid: string;
    buttonText: string;
    buttonPayload: string;
  },
): Promise<void> {
  const phoneDigits = normalizeBrazilPhoneE164Digits(
    phoneDigitsFromWhatsAppAddress(params.fromPhone),
  );

  const label = params.buttonPayload.trim() || params.buttonText.trim();
  const action = actionFromButtonLabel(label);
  if (!action) {
    console.info("[metaWabaInboundButton] rótulo não mapeado:", label);
    return;
  }

  let outbound = params.contextWamid
    ? await findOutboundByContextWamid(supabase, params.contextWamid)
    : null;

  if (!outbound) {
    outbound = await findOutboundByPhonePending(supabase, phoneDigits);
  }

  if (!outbound) {
    console.info("[metaWabaInboundButton] sem outbound pendente", phoneDigits);
    return;
  }

  if (action === "confirmar") {
    await confirmAppointment(supabase, outbound.agendamento_id, outbound);
    console.info("[metaWabaInboundButton] confirmado", outbound.agendamento_id);
    return;
  }

  await createPanelAlert(supabase, outbound.agendamento_id, action, outbound);
  console.info("[metaWabaInboundButton] alerta painel", action, outbound.agendamento_id);
}
