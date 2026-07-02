import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { refreshMpAccessToken } from "./mpOAuth.ts";

const MP_PAYMENTS_URL = "https://api.mercadopago.com/v1/payments";

export type HoldRow = {
  id: string;
  status: string;
  confirmation_token: string;
  mp_payment_id: string | null;
  valor_pago_centavos: number | null;
  valor_base_centavos: number | null;
  valor_restante_centavos: number | null;
  payment_expires_at: string | null;
  barbearia_id: string;
  installment_count: number | null;
};

export function appointmentExternalReference(agendamentoId: string) {
  return `appointment:${agendamentoId}`;
}

export function parseAppointmentExternalReference(ref: string): string | null {
  if (!ref.startsWith("appointment:")) return null;
  const id = ref.slice("appointment:".length).trim();
  return id || null;
}

export async function getSellerAccessToken(
  supabase: SupabaseClient,
  barbeariaId: string,
): Promise<{ shopId: string; accessToken: string; liveMode: boolean | null }> {
  const { data: shopId, error } = await supabase.rpc("mp_credentials_shop_id", {
    p_barbearia_id: barbeariaId,
  });
  if (error || !shopId) throw new Error("Conta Mercado Pago não encontrada para esta barbearia.");

  const { data: shop, error: shopErr } = await supabase
    .from("barbershops")
    .select("id, mp_access_token, mp_refresh_token, mp_token_expires_at, mp_connect_status, mp_live_mode")
    .eq("id", shopId)
    .maybeSingle();

  if (shopErr || !shop?.mp_access_token) {
    throw new Error("Mercado Pago não conectado para receber pagamentos.");
  }

  if (shop.mp_connect_status !== "connected") {
    throw new Error("Conta Mercado Pago desconectada. Reconecte em Pagamentos.");
  }

  let accessToken = String(shop.mp_access_token);
  const expiresAt = shop.mp_token_expires_at ? new Date(String(shop.mp_token_expires_at)).getTime() : 0;
  const needsRefresh = expiresAt > 0 && expiresAt < Date.now() + 5 * 60 * 1000;

  if (needsRefresh && shop.mp_refresh_token) {
    const refreshed = await refreshMpAccessToken(String(shop.mp_refresh_token));
    accessToken = String(refreshed.access_token ?? accessToken);
    await supabase
      .from("barbershops")
      .update({
        mp_access_token: accessToken,
        mp_refresh_token: String(refreshed.refresh_token ?? shop.mp_refresh_token),
        mp_token_expires_at: new Date(
          Date.now() + Number(refreshed.expires_in ?? 15552000) * 1000,
        ).toISOString(),
        mp_connect_status: "connected",
        mp_live_mode: refreshed.live_mode === true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shop.id);
  }

  return {
    shopId: String(shop.id),
    accessToken,
    liveMode: shop.mp_live_mode ?? null,
  };
}

export async function loadHoldForCheckout(
  supabase: SupabaseClient,
  agendamentoId: string,
  confirmationToken: string,
): Promise<HoldRow> {
  const { data: row, error } = await supabase
    .from("agendamentos")
    .select(
      "id, status, confirmation_token, mp_payment_id, valor_pago_centavos, valor_base_centavos, valor_restante_centavos, payment_expires_at, barbearia_id, installment_count",
    )
    .eq("id", agendamentoId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Agendamento não encontrado.");

  const appointment = row as HoldRow;
  if (appointment.confirmation_token !== confirmationToken) {
    throw new Error("Token inválido.");
  }

  if (appointment.status === "confirmado") {
    throw new Error("already_confirmed");
  }

  if (appointment.status !== "aguardando_pagamento") {
    throw new Error("Agendamento não está aguardando pagamento.");
  }

  if (appointment.payment_expires_at && new Date(appointment.payment_expires_at).getTime() < Date.now()) {
    await supabase.rpc("fail_appointment_payment", { p_agendamento_id: agendamentoId });
    throw new Error("Reserva expirada. Escolha outro horário.");
  }

  return appointment;
}

export function parsePaymentBrickSubmit(raw: Record<string, unknown>) {
  const paymentType = String(raw.paymentType ?? raw.selectedPaymentMethod ?? "").toLowerCase();
  const inner = (raw.formData as Record<string, unknown> | undefined) ?? raw;

  const isPix =
    paymentType.includes("bank_transfer") ||
    paymentType === "pix" ||
    String(inner.payment_method_id ?? "").toLowerCase() === "pix";

  let paymentMethodId = String(inner.payment_method_id ?? "").trim();
  if (isPix) paymentMethodId = "pix";

  const token = inner.token ? String(inner.token) : undefined;
  const installmentsRaw = inner.installments ?? inner.installment;
  const installments = installmentsRaw ? Number(installmentsRaw) : 1;

  const payer = (inner.payer as Record<string, unknown> | undefined) ?? undefined;
  const payerEmail = payer?.email ? String(payer.email).trim() : undefined;
  const identificationRaw = payer?.identification as { type?: string; number?: string } | undefined;
  const identification =
    identificationRaw?.number && identificationRaw?.type
      ? { type: String(identificationRaw.type), number: String(identificationRaw.number).replace(/\D/g, "") }
      : undefined;

  return {
    isPix,
    paymentMethodId,
    token,
    installments: Number.isFinite(installments) && installments > 0 ? installments : 1,
    payerEmail,
    identification,
  };
}

export type MpPaymentErrorInfo = {
  title: string;
  message: string;
  hint: string | null;
  mp_code: number | null;
  mp_status_detail: string | null;
  retry: boolean;
  release_hold: boolean;
  raw_message: string;
};

function readMpCause(payload: Record<string, unknown>) {
  const causes = Array.isArray(payload.cause) ? payload.cause : [];
  for (const item of causes) {
    if (typeof item !== "object" || !item) continue;
    const row = item as { code?: number | string; description?: string; data?: string };
    const codeRaw = row.code;
    const code =
      typeof codeRaw === "number"
        ? codeRaw
        : typeof codeRaw === "string" && /^\d+$/.test(codeRaw)
          ? Number(codeRaw)
          : null;
    const description = row.description ? String(row.description) : "";
    if (code != null || description) {
      return { code, description, data: row.data ? String(row.data) : null };
    }
  }
  return { code: null, description: "", data: null };
}

function explainByMpCode(code: number | null, description: string, rawMessage: string) {
  const blob = `${description} ${rawMessage}`.toLowerCase();

  if (code === 145 || blob.includes("invalid users involved")) {
    return {
      title: "Usuários incompatíveis (teste × produção)",
      message: "O Mercado Pago detectou mistura entre conta teste e conta real no pagamento.",
      hint:
        "Confira: vendedor conectado em Pagamentos (modo teste), e-mail/CPF do comprador teste copiados do painel MP → Contas de teste, chave pública TEST- da mesma app do OAuth e cartão de teste.",
      retry: true,
    };
  }

  if (blob.includes("invalid test user email")) {
    return {
      title: "E-mail de comprador teste inválido",
      message: "No modo teste, o e-mail precisa ser o do comprador teste criado no Mercado Pago.",
      hint:
        "Copie o e-mail exato em Mercado Pago Developers → sua app → Contas de teste → Comprador (ex.: test_user_...@testuser.com).",
      retry: true,
    };
  }

  if (code === 106 || blob.includes("different countries")) {
    return {
      title: "País incompatível",
      message: "Vendedor e comprador teste precisam ser do mesmo país (Brasil).",
      hint: "Crie/recrie as contas de teste com país Brasil na mesma aplicação MP.",
      retry: true,
    };
  }

  if (code === 109 || blob.includes("invalid number of shares") || blob.includes("installments")) {
    return {
      title: "Parcelamento inválido",
      message: "Este cartão ou meio de pagamento não aceita a quantidade de parcelas escolhida.",
      hint: "Tente 1x ou reduza o número de parcelas configurado no painel.",
      retry: true,
    };
  }

  if (code === 129) {
    return {
      title: "Valor ou meio inválido",
      message: "O Mercado Pago não aceita este valor com o meio de pagamento selecionado.",
      hint: "Teste outro cartão de teste ou altere cartão/Pix.",
      retry: true,
    };
  }

  if (code === 150 || code === 151) {
    return {
      title: "Comprador não autorizado",
      message: "A conta do pagador não pode concluir este pagamento agora.",
      hint: "Use outro comprador teste do painel MP ou verifique se a conta teste está ativa.",
      retry: true,
    };
  }

  if (code === 160 || blob.includes("collector not allowed")) {
    return {
      title: "Vendedor não autorizado",
      message: "A conta Mercado Pago da barbearia não pode receber este pagamento.",
      hint: "Reconecte o Mercado Pago em Pagamentos com o vendedor teste correto.",
      retry: false,
    };
  }

  if (code === 801) {
    return {
      title: "Pagamento duplicado",
      message: "Uma tentativa igual foi enviada há poucos segundos.",
      hint: "Aguarde ~1 minuto antes de tentar de novo.",
      retry: true,
    };
  }

  if (blob.includes("invalid payment method id")) {
    return {
      title: "Meio de pagamento inválido",
      message: "Não foi possível identificar cartão ou Pix para envio ao Mercado Pago.",
      hint: "Recarregue a página e tente novamente. Se persistir, teste outro meio (cartão/Pix).",
      retry: true,
    };
  }

  return null;
}

function explainByStatusDetail(statusDetail: string) {
  const d = statusDetail.toLowerCase();
  const map: Record<string, { title: string; message: string; hint: string; retry: boolean; release_hold: boolean }> = {
    cc_rejected_bad_filled_card_number: {
      title: "Número do cartão inválido",
      message: "Revise o número do cartão.",
      hint: "Cartão teste BR: 5031 4332 1540 6351.",
      retry: true,
      release_hold: false,
    },
    cc_rejected_bad_filled_date: {
      title: "Validade inválida",
      message: "Revise mês/ano de validade (data futura).",
      hint: "Ex.: 11/30.",
      retry: true,
      release_hold: false,
    },
    cc_rejected_bad_filled_other: {
      title: "Dados do cartão inválidos",
      message: "Revise CVV, nome ou documento do titular.",
      hint: "Nome teste APRO (aprovado), OTHE (recusado), etc.",
      retry: true,
      release_hold: false,
    },
    cc_rejected_bad_filled_security_code: {
      title: "CVV inválido",
      message: "Revise o código de segurança do cartão.",
      hint: "Cartão teste: CVV 123.",
      retry: true,
      release_hold: false,
    },
    cc_rejected_insufficient_amount: {
      title: "Saldo insuficiente",
      message: "O cartão teste não tem saldo para este valor.",
      hint: "Use cartão de teste MP ou reduza o valor do agendamento.",
      retry: true,
      release_hold: false,
    },
    cc_rejected_call_for_authorize: {
      title: "Cartão requer autorização",
      message: "O emissor exige autorização manual.",
      hint: "Use cartão de teste com nome APRO para simular aprovação.",
      retry: true,
      release_hold: false,
    },
    cc_rejected_high_risk: {
      title: "Pagamento bloqueado (risco)",
      message: "O Mercado Pago bloqueou por análise de risco.",
      hint: "Em teste, use comprador teste + cartão teste + nome APRO.",
      retry: true,
      release_hold: false,
    },
  };

  for (const [key, value] of Object.entries(map)) {
    if (d.includes(key)) return { ...value, mp_status_detail: statusDetail };
  }

  return null;
}

export function explainMpPaymentFailure(
  input: Record<string, unknown> | string | null | undefined,
  options?: { status?: string; status_detail?: string | null },
): MpPaymentErrorInfo {
  const payload =
    typeof input === "string"
      ? { message: input }
      : input && typeof input === "object"
        ? input
        : { message: "Erro desconhecido no Mercado Pago." };

  const rawMessage = String(payload.message ?? payload.error ?? "Erro no Mercado Pago.");
  const cause = readMpCause(payload);
  const statusDetail = String(options?.status_detail ?? payload.status_detail ?? cause.data ?? "").trim() || null;

  const byCode = explainByMpCode(cause.code, cause.description, rawMessage);
  if (byCode) {
    return {
      ...byCode,
      mp_code: cause.code,
      mp_status_detail: statusDetail,
      release_hold: false,
      raw_message: rawMessage,
    };
  }

  if (statusDetail) {
    const byDetail = explainByStatusDetail(statusDetail);
    if (byDetail) {
      return {
        title: byDetail.title,
        message: byDetail.message,
        hint: byDetail.hint,
        mp_code: cause.code,
        mp_status_detail: statusDetail,
        retry: byDetail.retry,
        release_hold: byDetail.release_hold,
        raw_message: rawMessage,
      };
    }
  }

  const status = String(options?.status ?? payload.status ?? "").toLowerCase();
  if (status === "rejected") {
    return {
      title: "Pagamento recusado",
      message: "O Mercado Pago recusou o pagamento.",
      hint: statusDetail
        ? `Detalhe MP: ${statusDetail}. Em teste, use comprador teste, cartão teste e nome APRO.`
        : "Em teste, use comprador teste, cartão teste e nome APRO.",
      mp_code: cause.code,
      mp_status_detail: statusDetail,
      retry: true,
      release_hold: true,
      raw_message: rawMessage,
    };
  }

  return {
    title: "Erro no pagamento",
    message: rawMessage,
    hint: cause.description
      ? `Mercado Pago: ${cause.description}${cause.code != null ? ` (código ${cause.code})` : ""}`
      : cause.code != null
        ? `Código Mercado Pago: ${cause.code}.`
        : null,
    mp_code: cause.code,
    mp_status_detail: statusDetail,
    retry: true,
    release_hold: false,
    raw_message: rawMessage,
  };
}

export class MpPaymentApiError extends Error {
  info: MpPaymentErrorInfo;

  constructor(info: MpPaymentErrorInfo) {
    super(info.message);
    this.name = "MpPaymentApiError";
    this.info = info;
  }
}

export async function createMpAppointmentPayment(params: {
  accessToken: string;
  supabaseUrl: string;
  agendamentoId: string;
  amountCentavos: number;
  paymentMethodId: string;
  token?: string;
  installments?: number;
  payerEmail?: string;
  payerIdentification?: { type: string; number: string };
  description?: string;
}): Promise<Record<string, unknown>> {
  const amount = params.amountCentavos / 100;
  const payer: Record<string, unknown> = {
    email: params.payerEmail?.trim() || "cliente@sentinelagendamentos.com",
  };
  if (params.payerIdentification?.number) {
    payer.identification = params.payerIdentification;
  }

  const body: Record<string, unknown> = {
    transaction_amount: amount,
    description: params.description ?? "Agendamento Sentinela",
    payment_method_id: params.paymentMethodId,
    external_reference: appointmentExternalReference(params.agendamentoId),
    notification_url: `${params.supabaseUrl.replace(/\/+$/, "")}/functions/v1/mp-webhook`,
    payer,
  };

  if (params.token) {
    body.token = params.token;
    body.installments = params.installments ?? 1;
  }

  const res = await fetch(MP_PAYMENTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new MpPaymentApiError(
      explainMpPaymentFailure(payload as Record<string, unknown>),
    );
  }

  return payload as Record<string, unknown>;
}

export async function fetchMpPayment(accessToken: string, paymentId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${MP_PAYMENTS_URL}/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error("Não foi possível consultar pagamento no Mercado Pago.");
  }
  return payload as Record<string, unknown>;
}

export function createServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
