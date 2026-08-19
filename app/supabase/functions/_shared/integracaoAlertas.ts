/**
 * Persistência de alertas de integração (Admin + profissional) via RPCs Postgres.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const INTEGRACAO_ALERTA_CODIGOS = {
  TWILIO_TEMPLATE_D1_AUSENTE: "twilio_template_d1_ausente",
  TWILIO_TEMPLATE_3H_AUSENTE: "twilio_template_3h_ausente",
} as const;

type SinalizarErroParams = {
  barbeariaId: string | null;
  integracao: string;
  codigo: string;
  titulo: string;
  mensagem: string;
  mensagemAcao?: string | null;
  severidade?: "warning" | "error";
};

export async function sinalizarErroIntegracao(
  supabase: SupabaseClient,
  params: SinalizarErroParams,
): Promise<void> {
  const { error } = await supabase.rpc("registrar_erro_integracao", {
    p_barbearia_id: params.barbeariaId,
    p_integracao: params.integracao,
    p_codigo: params.codigo,
    p_titulo: params.titulo,
    p_mensagem: params.mensagem,
    p_mensagem_acao: params.mensagemAcao ?? null,
    p_severidade: params.severidade ?? "warning",
  });

  if (error) {
    console.error("sinalizarErroIntegracao:", params.codigo, error.message);
  }
}

export async function sinalizarOkIntegracao(
  supabase: SupabaseClient,
  params: { barbeariaId: string | null; codigo: string },
): Promise<void> {
  const { error } = await supabase.rpc("registrar_ok_integracao", {
    p_barbearia_id: params.barbeariaId,
    p_codigo: params.codigo,
  });

  if (error) {
    console.error("sinalizarOkIntegracao:", params.codigo, error.message);
  }
}

export async function registrarSkipTwilioTemplateD1Ausente(supabase: SupabaseClient): Promise<void> {
  await sinalizarErroIntegracao(supabase, {
    barbeariaId: null,
    integracao: "whatsapp",
    codigo: INTEGRACAO_ALERTA_CODIGOS.TWILIO_TEMPLATE_D1_AUSENTE,
    titulo: "WhatsApp",
    mensagem: "Lembretes de confirmação (1 dia antes) não estão sendo enviados.",
    severidade: "warning",
  });
}

export async function registrarOkTwilioTemplateD1(supabase: SupabaseClient): Promise<void> {
  await sinalizarOkIntegracao(supabase, {
    barbeariaId: null,
    codigo: INTEGRACAO_ALERTA_CODIGOS.TWILIO_TEMPLATE_D1_AUSENTE,
  });
}

export async function registrarSkipTwilioTemplate3hAusente(supabase: SupabaseClient): Promise<void> {
  await sinalizarErroIntegracao(supabase, {
    barbeariaId: null,
    integracao: "whatsapp",
    codigo: INTEGRACAO_ALERTA_CODIGOS.TWILIO_TEMPLATE_3H_AUSENTE,
    titulo: "WhatsApp",
    mensagem: "Lembretes do dia do agendamento não estão sendo enviados.",
    severidade: "warning",
  });
}

export async function registrarOkTwilioTemplate3h(supabase: SupabaseClient): Promise<void> {
  await sinalizarOkIntegracao(supabase, {
    barbeariaId: null,
    codigo: INTEGRACAO_ALERTA_CODIGOS.TWILIO_TEMPLATE_3H_AUSENTE,
  });
}
