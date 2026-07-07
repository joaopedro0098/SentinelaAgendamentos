/**
 * Cobrança da assinatura Sentinela (conta MP da plataforma).
 * NUNCA usar getSellerAccessToken / mp_access_token OAuth do profissional aqui.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Alinhado ao trial interno (trial_started_at + 14 dias) — não altera a lógica do banco. */
export const SENTINELA_SUBSCRIPTION_TRIAL_DAYS = 14;

export function buildPreapprovalFreeTrial() {
  return {
    frequency: SENTINELA_SUBSCRIPTION_TRIAL_DAYS,
    frequency_type: "days" as const,
  };
}

export function getPlatformMpAccessToken(): string {
  const token = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
  if (!token) {
    throw new Error("Mercado Pago da plataforma não configurado (MP_ACCESS_TOKEN).");
  }
  return token;
}

export type SubscriptionTier = "start" | "pro";

/** Normaliza tier do front/API para start | pro. */
export function normalizeSubscriptionTier(tier?: string | null): SubscriptionTier | null {
  const normalized = tier?.trim().toLowerCase();
  if (normalized === "start" || normalized === "39") return "start";
  if (normalized === "pro" || normalized === "49") return "pro";
  return null;
}

/** Card Payment Brick envia o token na raiz ou em formData. */
export function parseCardPaymentBrickSubmit(raw: Record<string, unknown>) {
  const inner =
    raw.formData && typeof raw.formData === "object"
      ? (raw.formData as Record<string, unknown>)
      : raw;

  const token = inner.token ? String(inner.token).trim() : undefined;
  const paymentMethodId = inner.payment_method_id
    ? String(inner.payment_method_id).trim()
    : undefined;
  const issuerId = inner.issuer_id != null ? String(inner.issuer_id).trim() : undefined;

  return { token, paymentMethodId, issuerId };
}

export function explainPreapprovalCardMpError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("card token")) {
    return {
      error:
        "O Mercado Pago não reconheceu o token do cartão. Verifique se VITE_MP_PUBLIC_KEY e MP_ACCESS_TOKEN são da mesma aplicação (Credenciais de teste) e se os planos de assinatura foram criados nessa conta.",
      hint:
        "Painel MP → aplicação da plataforma → Credenciais de teste: copie Public Key (front) e Access Token (Supabase) do mesmo bloco.",
    };
  }
  return { error: message, hint: null as string | null };
}

export function getTierMonthlyAmount(tier: SubscriptionTier): number {
  return tier === "pro" ? 49.9 : 39.9;
}

/** Plano de assinatura (preapproval_plan_id) — tier start | pro (ou legado 39 | 49). */
export function getPreapprovalPlanId(tier?: string | null): string {
  const normalizedTier = normalizeSubscriptionTier(tier);
  if (normalizedTier === "start") {
    const tier39 = Deno.env.get("MP_PREAPPROVAL_PLAN_ID_39")?.trim();
    if (tier39) return tier39;
  }
  if (normalizedTier === "pro") {
    const tier49 = Deno.env.get("MP_PREAPPROVAL_PLAN_ID_49")?.trim();
    if (tier49) return tier49;
  }

  const legacy = tier?.trim();
  if (legacy === "39") {
    const tier39 = Deno.env.get("MP_PREAPPROVAL_PLAN_ID_39")?.trim();
    if (tier39) return tier39;
  }
  if (legacy === "49") {
    const tier49 = Deno.env.get("MP_PREAPPROVAL_PLAN_ID_49")?.trim();
    if (tier49) return tier49;
  }

  const defaultPlan = Deno.env.get("MP_PREAPPROVAL_PLAN_ID")?.trim();
  if (!defaultPlan) {
    throw new Error("MP_PREAPPROVAL_PLAN_ID não configurado.");
  }
  return defaultPlan;
}

export function buildPreapprovalExternalReference(shopId: string, tier?: SubscriptionTier | null) {
  if (tier) return `barbershop_preapproval:${shopId}:${tier}`;
  return `barbershop_preapproval:${shopId}`;
}

export function parsePreapprovalExternalReference(externalReference: string | null | undefined) {
  const ref = externalReference?.trim();
  if (!ref?.startsWith("barbershop_preapproval:")) return { shopId: null, tier: null as SubscriptionTier | null };
  const rest = ref.slice("barbershop_preapproval:".length);
  const [shopId, tierRaw] = rest.split(":");
  return {
    shopId: shopId?.trim() || null,
    tier: normalizeSubscriptionTier(tierRaw),
  };
}

export function parseShopIdFromPreapprovalExternalReference(
  externalReference: string | null | undefined,
): string | null {
  return parsePreapprovalExternalReference(externalReference).shopId;
}

export function buildPlanPixExternalReference(shopId: string, tier: SubscriptionTier) {
  return `barbershop_plan_pix:${shopId}:${tier}`;
}

export function parsePlanPixExternalReference(externalReference: string | null | undefined) {
  const ref = externalReference?.trim();
  if (!ref?.startsWith("barbershop_plan_pix:")) return { shopId: null, tier: null as SubscriptionTier | null };
  const rest = ref.slice("barbershop_plan_pix:".length);
  const [shopId, tierRaw] = rest.split(":");
  return {
    shopId: shopId?.trim() || null,
    tier: normalizeSubscriptionTier(tierRaw),
  };
}

export async function activateShopSubscription(
  supabase: SupabaseClient,
  shopId: string,
  params: {
    tier: SubscriptionTier;
    lastPaymentMethod: "pix" | "mp_sub";
    mpSubscriptionId?: string | null;
    currentPeriodEnd?: string | null;
  },
) {
  const { data: shop } = await supabase
    .from("barbershops")
    .select("current_period_end")
    .eq("id", shopId)
    .maybeSingle();

  const periodEnd = getNextSubscriptionPeriodEnd(params.currentPeriodEnd ?? shop?.current_period_end);

  const update: Record<string, unknown> = {
    subscription_status: "active",
    subscription_tier: params.tier,
    last_payment_method: params.lastPaymentMethod,
    current_period_end: periodEnd,
    grace_until: null,
    subscription_notice: null,
  };
  if (params.lastPaymentMethod === "pix") {
    update.mp_subscription_id = null;
  } else if (params.mpSubscriptionId) {
    update.mp_subscription_id = params.mpSubscriptionId;
  }

  await supabase.from("barbershops").update(update).eq("id", shopId);

  return periodEnd;
}

export type PreapprovalUiStatus = "approved" | "pending" | "error";

/** Status real vindo da API Mercado Pago → UI da página de retorno. */
export function mapPreapprovalToUiStatus(mpStatus: string | null | undefined): PreapprovalUiStatus {
  const normalized = mpStatus?.trim().toLowerCase() ?? "";
  if (normalized === "authorized") return "approved";
  if (normalized === "pending") return "pending";
  return "error";
}

export async function fetchMpPreapproval(preapprovalId: string) {
  const token = getPlatformMpAccessToken();
  const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message?: string }).message)
        : `Mercado Pago retornou HTTP ${res.status}`;
    throw new Error(message);
  }

  return data as {
    id?: string;
    status?: string;
    external_reference?: string;
    payer_email?: string;
    init_point?: string;
  };
}

export function getNextSubscriptionPeriodEnd(currentPeriodEnd: string | null | undefined) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const current = currentPeriodEnd ? new Date(`${currentPeriodEnd}T00:00:00Z`) : null;
  const base = current && current > today ? current : today;
  const next = new Date(base);
  next.setDate(next.getDate() + 30);
  return next.toISOString().slice(0, 10);
}

export function buildMpWebhookEventKey(params: {
  notificationId?: string | number | null;
  resourceType: string;
  resourceId: string;
  action?: string | null;
  resourceStatus: string;
}) {
  const notification = params.notificationId != null ? String(params.notificationId).trim() : "";
  if (notification) {
    return `${params.resourceType}:${notification}:${params.resourceStatus}`;
  }
  const action = params.action?.trim() || "event";
  return `${params.resourceType}:${params.resourceId}:${action}:${params.resourceStatus}`;
}

/** Retorna false se o evento já foi processado (duplicata do MP). */
export async function claimMpWebhookEvent(
  supabase: SupabaseClient,
  eventKey: string,
  meta: { resource_type: string; resource_id: string; resource_status: string },
): Promise<boolean> {
  const { error } = await supabase.from("mp_webhook_events").insert({
    event_key: eventKey,
    resource_type: meta.resource_type,
    resource_id: meta.resource_id,
    resource_status: meta.resource_status,
  });

  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

export type PreapprovalFailureStatus = "cancelled" | "rejected" | "paused";

export function normalizePreapprovalFailureStatus(
  mpStatus: string | null | undefined,
): PreapprovalFailureStatus | null {
  const normalized = mpStatus?.trim().toLowerCase() ?? "";
  if (normalized === "cancelled" || normalized === "rejected" || normalized === "paused") {
    return normalized;
  }
  return null;
}

export function preapprovalFailureNotice(status: PreapprovalFailureStatus) {
  if (status === "rejected") {
    return "Pagamento recusado pelo Mercado Pago. Verifique o cartão ou tente outro meio de pagamento em Conta.";
  }
  if (status === "cancelled") {
    return "Assinatura cancelada no Mercado Pago. Você pode tentar novamente em Conta quando quiser.";
  }
  return "Assinatura pausada no Mercado Pago. Regularize em Conta ou fale com o suporte.";
}
