import { supabase } from "@/integrations/supabase/client";
import { notifyPanelAgendamentosChanged } from "@agenda/lib/panelAgendamentosRefresh";
import {
  checkBarbeariaCanBook,
  isSubscriptionBlockError,
} from "@agenda/lib/subscription";

export type SlotBookingServico = {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco_centavos?: number;
};

export type CreatePanelSlotBookingInput = {
  barbeariaId: string;
  barbeiroId: string;
  data: string;
  hora: string;
  clienteWhatsappDigits: string;
  clienteNome: string;
  servicosNomes: string[];
  duracaoMinutos: number;
  observacao?: string | null;
};

export async function createPanelSlotBooking(
  input: CreatePanelSlotBookingInput,
): Promise<{ ok: true; agendamentoId: string } | { ok: false; error: string; slotTaken?: boolean }> {
  const canBook = await checkBarbeariaCanBook(input.barbeariaId);
  if (!canBook) {
    return { ok: false, error: "Assinatura inativa ou limite atingido." };
  }

  const { data: cadastro } = await supabase.rpc("get_cliente_cadastro_por_whatsapp", {
    p_barbearia_id: input.barbeariaId,
    p_whatsapp: input.clienteWhatsappDigits,
  });

  if (!cadastro || typeof cadastro !== "object" || !("id" in cadastro)) {
    return { ok: false, error: "Cliente não encontrado no cadastro." };
  }

  const clienteId = String((cadastro as { id: string }).id);
  const nomeCadastro = String((cadastro as { nome?: string }).nome ?? "").trim();
  const whatsCadastro = String((cadastro as { whatsapp?: string }).whatsapp ?? input.clienteWhatsappDigits);

  const { data: createdAppointment, error } = await supabase
    .from("agendamentos")
    .insert({
      barbearia_id: input.barbeariaId,
      barbeiro_id: input.barbeiroId,
      data: input.data,
      hora: input.hora,
      cliente_nome: nomeCadastro || input.clienteNome,
      cliente_whatsapp: whatsCadastro,
      cliente_id: clienteId,
      duracao_minutos: input.duracaoMinutos,
      servicos_nomes: input.servicosNomes,
      status: "confirmado",
      observacao: input.observacao?.trim() || null,
      origem: "painel",
      requires_client_confirmation: true,
    })
    .select("id, confirmation_token")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Esse horário acabou de ser preenchido.", slotTaken: true };
    }
    if (isSubscriptionBlockError(error.message)) {
      return { ok: false, error: "Assinatura inativa ou limite atingido." };
    }
    return { ok: false, error: error.message };
  }

  if (createdAppointment?.id) {
    void supabase.functions
      .invoke("sync-panel-push-subscription", { body: { agendamento_id: createdAppointment.id } })
      .catch(() => undefined);
    notifyPanelAgendamentosChanged({
      data: input.data,
      barbeiroId: input.barbeiroId,
      agendamentoId: createdAppointment.id,
    });
  }

  return { ok: true, agendamentoId: createdAppointment!.id };
}
