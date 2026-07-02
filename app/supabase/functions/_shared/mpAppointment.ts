import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  exchangeMpAuthorizationCode,
  getMpAppointmentsClientId,
  getMpAppointmentsClientSecret,
} from "./mpOAuth.ts";

const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
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

async function refreshMpAccessToken(refreshToken: string): Promise<Record<string, unknown>> {
  const clientId = getMpAppointmentsClientId();
  const clientSecret = getMpAppointmentsClientSecret();
  if (!clientId || !clientSecret) throw new Error("OAuth Mercado Pago não configurado.");

  const res = await fetch(MP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message)
        : "Não foi possível renovar token Mercado Pago.",
    );
  }
  return payload as Record<string, unknown>;
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
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: string }).message)
        : `HTTP ${res.status}`;
    throw new Error(message);
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
