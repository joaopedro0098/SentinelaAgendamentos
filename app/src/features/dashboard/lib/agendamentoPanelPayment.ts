import { supabase } from "@/integrations/supabase/client";
import type { AppointmentChargeFormState } from "@/features/dashboard/components/pagamentos/AppointmentChargeSettingsForm";
import { parseChargeFormDepositValue } from "@/features/dashboard/components/pagamentos/AppointmentChargeSettingsForm";

export const COMPROVANTE_ACCEPT =
  ".pdf,.svg,.jpg,.jpeg,.png,application/pdf,image/svg+xml,image/jpeg,image/png";

export const COMPROVANTE_MAX_BYTES = 10 * 1024 * 1024;

export type PanelPaymentChargeKind = "automatic" | "manual";

export type AgendamentoPanelPaymentInfo = {
  ok?: boolean;
  error?: string;
  agendamento_id?: string;
  status?: string;
  payment_status?: string | null;
  valor_base_centavos?: number | null;
  valor_pago_centavos?: number | null;
  valor_restante_centavos?: number | null;
  has_panel_snapshot?: boolean;
  has_comprovante?: boolean;
  charge_kind?: PanelPaymentChargeKind | null;
  payment_mode?: string | null;
  deposit_type?: string | null;
  deposit_value?: number | null;
  payment_enable_card?: boolean | null;
  payment_enable_pix?: boolean | null;
  payment_pass_fee_card?: boolean | null;
  payment_pass_fee_pix?: boolean | null;
  payment_max_installments?: number | null;
  charge_centavos?: number | null;
  total_centavos?: number | null;
  remaining_centavos?: number | null;
};

export type AgendamentoComprovanteListItem = {
  id: string;
  mime_type?: string;
  file_name?: string;
};

export type AgendamentoComprovanteViewMeta = {
  ok?: boolean;
  error?: string;
  id?: string;
  storage_path?: string;
  mime_type?: string;
  file_name?: string;
};

export const MAX_COMPROVANTES_POR_AGENDAMENTO = 2;

export function formatPanelMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valor único exibido no modal quando a cobrança foi por link automático. */
export function panelAutomaticPaymentAmountLabel(info: AgendamentoPanelPaymentInfo | null): string | null {
  if (!info?.has_panel_snapshot || info.charge_kind !== "automatic") return null;
  const paid = info.valor_pago_centavos ?? 0;
  if (paid > 0) return formatPanelMoney(paid);
  if (info.payment_status === "paid" && (info.charge_centavos ?? 0) > 0) {
    return formatPanelMoney(info.charge_centavos!);
  }
  return null;
}

export function panelFormaPagamentoLabel(info: AgendamentoPanelPaymentInfo | null): string {
  if (!info?.has_panel_snapshot) return "sem pagamento";
  if (info.charge_kind === "manual") return "pagamento manual";
  if (info.charge_kind === "automatic") return "Link de pagamento";
  return "sem pagamento";
}

export async function listAgendamentoComprovantesMeta(
  agendamentoId: string,
): Promise<{ items: AgendamentoComprovanteListItem[]; error?: string }> {
  const { data, error } = await supabase.rpc("list_agendamento_comprovantes_meta", {
    p_agendamento_id: agendamentoId,
  });
  if (error) return { items: [], error: error.message };
  const row = (data ?? {}) as { error?: string; items?: AgendamentoComprovanteListItem[] };
  if (row.error) return { items: [], error: row.error };
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    items: items.filter((i) => i?.id).map((i) => ({
      id: String(i.id),
      mime_type: i.mime_type,
      file_name: i.file_name,
    })),
  };
}

export async function fetchAgendamentoComprovanteById(
  comprovanteId: string,
): Promise<AgendamentoComprovanteViewMeta> {
  const { data, error } = await supabase.rpc("get_agendamento_comprovante_by_id", {
    p_comprovante_id: comprovanteId,
  });
  if (error) return { error: error.message };
  return (data ?? { error: "empty" }) as AgendamentoComprovanteViewMeta;
}

export async function openComprovanteInNewTab(comprovanteId: string): Promise<{ error?: string }> {
  const meta = await fetchAgendamentoComprovanteById(comprovanteId);
  if (meta.error || !meta.storage_path) {
    return { error: meta.error ?? "Comprovante não encontrado." };
  }
  const signed = await createAgendamentoComprovanteSignedUrl(meta.storage_path);
  if ("error" in signed) return { error: signed.error };
  window.open(signed.url, "_blank", "noopener,noreferrer");
  return {};
}

export type AgendamentoComprovanteMeta = {
  found?: boolean;
  error?: string;
  storage_path?: string;
  mime_type?: string;
  file_name?: string;
  size_bytes?: number;
  uploaded_at?: string;
};

export async function saveAgendamentoPanelPaymentSnapshot(params: {
  agendamentoId: string;
  chargeKind: PanelPaymentChargeKind;
  chargeForm?: AppointmentChargeFormState;
  chargeCentavos?: number | null;
  totalCentavos?: number | null;
  remainingCentavos?: number | null;
}): Promise<{ ok: true } | { error: string }> {
  const dep =
    params.chargeForm && params.chargeForm.paymentMode === "deposit"
      ? parseChargeFormDepositValue(params.chargeForm)
      : null;

  const { data, error } = await supabase.rpc("upsert_agendamento_panel_pagamento", {
    p_agendamento_id: params.agendamentoId,
    p_charge_kind: params.chargeKind,
    p_payment_mode: params.chargeForm?.paymentMode ?? null,
    p_deposit_type:
      params.chargeForm?.paymentMode === "deposit" ? params.chargeForm.depositType : null,
    p_deposit_value: dep?.ok ? dep.depositValue : null,
    p_payment_enable_card: params.chargeForm?.enableCard ?? null,
    p_payment_enable_pix: params.chargeForm?.enablePix ?? null,
    p_payment_pass_fee_card: false,
    p_payment_pass_fee_pix: false,
    p_payment_max_installments: params.chargeForm?.enableCard
      ? parseInt(params.chargeForm.maxInstallments, 10) || 1
      : 1,
    p_charge_centavos: params.chargeCentavos ?? null,
    p_total_centavos: params.totalCentavos ?? null,
    p_remaining_centavos: params.remainingCentavos ?? null,
  });

  if (error) return { error: error.message };
  const row = data as { error?: string; ok?: boolean } | null;
  if (row?.error) return { error: row.error };
  return { ok: true };
}

export async function fetchAgendamentoPanelPaymentInfo(
  agendamentoId: string,
): Promise<AgendamentoPanelPaymentInfo> {
  const { data, error } = await supabase.rpc("get_agendamento_panel_pagamento_info", {
    p_agendamento_id: agendamentoId,
  });
  if (error) return { error: error.message };
  return (data ?? { error: "empty" }) as AgendamentoPanelPaymentInfo;
}

export async function fetchAgendamentoComprovanteMeta(
  agendamentoId: string,
): Promise<AgendamentoComprovanteMeta> {
  const { data, error } = await supabase.rpc("get_agendamento_comprovante_meta", {
    p_agendamento_id: agendamentoId,
  });
  if (error) return { error: error.message };
  return (data ?? { found: false }) as AgendamentoComprovanteMeta;
}

export async function createAgendamentoComprovanteSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("agendamento-comprovantes")
    .createSignedUrl(storagePath, 3600);
  if (error) return { error: error.message };
  if (!data?.signedUrl) return { error: "URL indisponível" };
  return { url: data.signedUrl };
}

export function validateComprovanteFile(file: File): { ok: true } | { ok: false; message: string } {
  if (file.size <= 0) return { ok: false, message: "O arquivo está vazio." };
  if (file.size > COMPROVANTE_MAX_BYTES) {
    return { ok: false, message: "Limite de 10MB por upload excedido." };
  }
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  const allowedExt = [".pdf", ".svg", ".jpg", ".jpeg", ".png"];
  const allowedMime = ["application/pdf", "image/svg+xml", "image/jpeg", "image/png"];
  const extOk = allowedExt.some((e) => name.endsWith(e));
  const mimeOk = !mime || allowedMime.includes(mime);
  if (!extOk && !mimeOk) {
    return { ok: false, message: "Formato não suportado. Envie PDF, SVG, JPG ou PNG." };
  }
  return { ok: true };
}

export async function uploadAgendamentoComprovante(
  agendamentoId: string,
  file: File,
): Promise<{ ok: true; id?: string } | { error: string }> {
  const validation = validateComprovanteFile(file);
  if (!validation.ok) return { error: validation.message };

  const form = new FormData();
  form.append("file", file);
  form.append("agendamento_id", agendamentoId);

  const { data, error } = await supabase.functions.invoke("upload-agendamento-comprovante", {
    body: form,
  });

  if (error) {
    let message = error.message || "Não foi possível enviar o comprovante.";
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = (await ctx.json()) as { message?: string; error?: string };
        if (body?.message) message = body.message;
      } catch {
        /* mantém mensagem padrão */
      }
    }
    if (/failed to send a request to the edge function/i.test(message)) {
      message =
        "Serviço de upload indisponível. Confirme se a função upload-agendamento-comprovante está publicada no Supabase.";
    }
    return { error: message };
  }
  const payload = data as { ok?: boolean; error?: string; message?: string } | null;
  if (payload?.error) return { error: payload.message ?? payload.error };
  if (!payload?.ok) return { error: "Não foi possível enviar o comprovante." };
  return { ok: true, id: payload.id as string | undefined };
}
