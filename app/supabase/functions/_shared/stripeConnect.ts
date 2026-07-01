import Stripe from "https://esm.sh/stripe@17.7.0?target=denonext";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY).");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export function getStripeApiVersion(): string {
  return Deno.env.get("STRIPE_API_VERSION")?.trim() || "2025-07-30.preview";
}

export function cleanAppUrl(value: string | null | undefined, fallback?: string | null) {
  return (
    value?.trim().replace(/\/+$/, "") ||
    fallback?.trim().replace(/\/+$/, "") ||
    "https://www.sentinelagendamentos.com"
  );
}

function isLocalDevOrigin(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Em dev (localhost) volta para o mesmo host; em produção usa APP_URL. */
export function resolveAppOriginForConnect(
  appUrlEnv: string | null | undefined,
  originHeader: string | null | undefined,
  clientOrigin?: string | null,
) {
  const localCandidate = [clientOrigin, originHeader]
    .map((value) => value?.trim())
    .filter(Boolean)
    .map((value) => cleanAppUrl(value))
    .find(isLocalDevOrigin);

  if (localCandidate) return localCandidate;

  const appUrl = cleanAppUrl(appUrlEnv, originHeader);

  if (clientOrigin?.trim()) {
    try {
      const clientHost = new URL(clientOrigin.trim()).host;
      const appHost = new URL(appUrl).host;
      if (clientHost === appHost) return cleanAppUrl(clientOrigin);
    } catch {
      /* ignore */
    }
  }

  return appUrl;
}

export function paymentsReturnUrls(origin: string) {
  const base = cleanAppUrl(origin);
  return {
    return_url: `${base}/app/pagamentos?stripe=return`,
    refresh_url: `${base}/app/pagamentos?stripe=refresh`,
  };
}

type V2Error = { error?: { message?: string; type?: string } };

/** Tenta criar conta Connect via Accounts v2; retorna null se indisponível. */
export async function tryCreateConnectAccountV2(email: string, shopId: string, ownerId: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY ausente.");

  const res = await fetch("https://api.stripe.com/v2/core/accounts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": getStripeApiVersion(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contact_email: email,
      identity: { country: "BR" },
      dashboard: "express",
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      metadata: { shop_id: shopId, owner_id: ownerId, source: "sentinela_connect_v2" },
    }),
  });

  const payload = (await res.json()) as { id?: string } & V2Error;
  if (!res.ok) {
    const msg = payload.error?.message ?? `Stripe v2 accounts HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!payload.id) throw new Error("Stripe v2 não retornou account id.");
  return payload.id;
}

/** Contas v2 criadas sem recipient precisam de stripe_transfers para destination charges. */
export async function requestConnectRecipientTransfersV2(accountId: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY ausente.");

  const res = await fetch(`https://api.stripe.com/v2/core/accounts/${accountId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": getStripeApiVersion(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
    }),
  });

  const payload = (await res.json()) as V2Error;
  if (!res.ok) {
    const msg = payload.error?.message ?? `Stripe v2 account update HTTP ${res.status}`;
    throw new Error(msg);
  }
}

export function accountCanReceiveDestinationCharges(account: Stripe.Account): boolean {
  return account.capabilities?.transfers === "active";
}

export function connectAccountPixPaymentsActive(account: Stripe.Account): boolean {
  return account.capabilities?.pix_payments === "active";
}

export function appointmentPaymentMethodTypes(account: Stripe.Account): string[] {
  const types = ["card"];
  if (connectAccountPixPaymentsActive(account)) types.push("pix");
  return types;
}

/** Lê a conta Connect na Stripe (Pix só entra no checkout se já estiver active na conta). */
export async function refreshConnectAccountWithPix(
  stripe: Stripe,
  accountId: string,
): Promise<Stripe.Account> {
  return stripe.accounts.retrieve(accountId);
}

/** Conta plataforma (titular da secret key) — útil para checar Pix habilitado. */
export async function retrievePlatformAccount(stripe: Stripe) {
  try {
    return await stripe.accounts.retrieve();
  } catch (e) {
    console.warn("retrievePlatformAccount:", e);
    return null;
  }
}

export function capabilityStatusLabel(status: string | undefined | null): string {
  switch (status) {
    case "active":
      return "ativo";
    case "pending":
      return "pendente";
    case "inactive":
      return "inativo";
    default:
      return status ?? "não solicitado";
  }
}

export async function retrieveAppointmentPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
  connectAccountId: string,
) {
  return stripe.paymentIntents.retrieve(paymentIntentId, {
    stripeAccount: connectAccountId,
  });
}

/** Só na criação: tenta conta conectada e, se falhar, PI legado na plataforma. */
export async function retrieveAppointmentPaymentIntentForCreate(
  stripe: Stripe,
  paymentIntentId: string,
  connectAccountId: string,
) {
  try {
    return await retrieveAppointmentPaymentIntent(stripe, paymentIntentId, connectAccountId);
  } catch {
    return stripe.paymentIntents.retrieve(paymentIntentId);
  }
}

export function buildCardInstallmentOptions(installmentCount: number): Stripe.PaymentIntentCreateParams.PaymentMethodOptions {
  if (installmentCount <= 1) {
    return { card: { installments: { enabled: false } } };
  }
  // Plano (count/interval) só pode ser enviado na confirmação — aqui apenas habilita parcelas.
  return {
    card: {
      installments: {
        enabled: true,
      },
    },
  };
}

export function buildCardInstallmentPlanForConfirm(installmentCount: number) {
  if (installmentCount <= 1) return undefined;
  return {
    type: "fixed_count" as const,
    interval: "month" as const,
    count: installmentCount,
  };
}

export function appointmentPaymentIntentMethodTypes(
  account: Stripe.Account,
  installmentCount: number,
): string[] {
  if (installmentCount > 1) return ["card"];
  return appointmentPaymentMethodTypes(account);
}

export function appointmentPaymentIntentNeedsReplace(
  existing: Stripe.PaymentIntent,
  amount: number,
  installmentCount: number,
): boolean {
  if (existing.status === "canceled") return true;
  if (isLegacyDestinationChargeIntent(existing)) return true;
  if (existing.amount !== amount) return true;
  if (String(existing.metadata?.installment_count ?? "1") !== String(installmentCount)) return true;
  const installmentsEnabled = existing.payment_method_options?.card?.installments?.enabled === true;
  if (installmentCount > 1) {
    if (existing.payment_method_types?.includes("pix")) return true;
    if (!installmentsEnabled) return true;
  } else if (installmentsEnabled) {
    return true;
  }
  return false;
}

export async function createAppointmentPaymentIntent(
  stripe: Stripe,
  params: {
    amount: number;
    connectAccountId: string;
    metadata: Record<string, string>;
    connectAccount?: Stripe.Account;
    installmentCount?: number;
  },
) {
  const installmentCount = Math.max(1, params.installmentCount ?? 1);
  const account = params.connectAccount ??
    await stripe.accounts.retrieve(params.connectAccountId);
  const payment_method_types = appointmentPaymentIntentMethodTypes(account, installmentCount);

  return stripe.paymentIntents.create(
    {
      amount: params.amount,
      currency: "brl",
      payment_method_types,
      payment_method_options: buildCardInstallmentOptions(installmentCount),
      metadata: params.metadata,
    },
    { stripeAccount: params.connectAccountId },
  );
}

export async function updateAppointmentPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
  connectAccountId: string,
  params: {
    amount: number;
    metadata: Record<string, string>;
    installmentCount: number;
    connectAccount?: Stripe.Account;
  },
) {
  const account = params.connectAccount ??
    await stripe.accounts.retrieve(connectAccountId);
  const payment_method_types = appointmentPaymentIntentMethodTypes(account, params.installmentCount);

  return stripe.paymentIntents.update(
    paymentIntentId,
    {
      amount: params.amount,
      currency: "brl",
      payment_method_types,
      payment_method_options: buildCardInstallmentOptions(params.installmentCount),
      metadata: params.metadata,
    },
    { stripeAccount: connectAccountId },
  );
}

export function isLegacyDestinationChargeIntent(pi: Stripe.PaymentIntent): boolean {
  return Boolean(pi.transfer_data?.destination);
}

/** Tenta Account Link v2; retorna null se indisponível. */
export async function tryCreateAccountLinkV2(accountId: string, returnUrl: string, refreshUrl: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY ausente.");

  const res = await fetch("https://api.stripe.com/v2/core/account_links", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": getStripeApiVersion(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          return_url: returnUrl,
          refresh_url: refreshUrl,
        },
      },
    }),
  });

  const payload = (await res.json()) as { url?: string } & V2Error;
  if (!res.ok) {
    const msg = payload.error?.message ?? `Stripe v2 account_links HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!payload.url) throw new Error("Stripe v2 não retornou URL de onboarding.");
  return payload.url;
}

export function assertStripeTestMode() {
  const key = Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
  if (!key.startsWith("sk_test_")) {
    throw new Error("Disponível apenas com STRIPE_SECRET_KEY de teste (sk_test_).");
  }
}

function splitOwnerName(displayName: string | null | undefined, email: string) {
  const base = (displayName ?? "").trim();
  if (base) {
    const parts = base.split(/\s+/);
    return {
      first_name: parts[0] ?? "Teste",
      last_name: parts.slice(1).join(" ") || "Sentinela",
    };
  }
  const local = email.split("@")[0] ?? "teste";
  return { first_name: local, last_name: "Sentinela" };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTestConnectSeedFields(params: {
  email: string;
  shopId: string;
  ownerId: string;
  displayName?: string | null;
}) {
  const { first_name, last_name } = splitOwnerName(params.displayName, params.email);
  const now = Math.floor(Date.now() / 1000);
  const holderName = `${first_name} ${last_name}`.slice(0, 120);

  return {
    holderName,
    now,
    createParams: {
      type: "custom" as const,
      country: "BR",
      email: params.email,
      business_type: "individual" as const,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_profile: {
        mcc: "7230",
        name: params.displayName?.trim() || holderName,
        url: cleanAppUrl(Deno.env.get("APP_URL")),
      },
      individual: {
        first_name,
        last_name,
        email: params.email,
        phone: "+5511999999999",
        dob: { day: 1, month: 1, year: 1990 },
        address: {
          // Token Stripe: habilita charges + payouts em test mode.
          line1: "address_full_match",
          city: "Sao Paulo",
          state: "SP",
          postal_code: "01310100",
          country: "BR",
        },
        id_number: "52998224725",
        political_exposure: "none" as const,
        verification: {
          document: {
            front: "file_identity_document_success",
          },
        },
      },
      tos_acceptance: {
        date: now,
        ip: "127.0.0.1",
      },
      metadata: {
        shop_id: params.shopId,
        owner_id: params.ownerId,
        source: "sentinela_test_seed",
      },
    },
    updateParams: {
      business_profile: {
        mcc: "7230",
        name: params.displayName?.trim() || holderName,
        url: cleanAppUrl(Deno.env.get("APP_URL")),
      },
      individual: {
        first_name,
        last_name,
        email: params.email,
        phone: "+5511999999999",
        dob: { day: 1, month: 1, year: 1990 },
        address: {
          line1: "address_full_match",
          city: "Sao Paulo",
          state: "SP",
          postal_code: "01310100",
          country: "BR",
        },
        id_number: "52998224725",
        political_exposure: "none" as const,
        verification: {
          document: {
            front: "file_identity_document_success",
          },
        },
      },
      tos_acceptance: {
        date: now,
        ip: "127.0.0.1",
      },
      metadata: {
        shop_id: params.shopId,
        owner_id: params.ownerId,
        source: "sentinela_test_seed",
      },
    },
  };
}

async function ensureTestConnectBankAccount(
  stripe: Stripe,
  accountId: string,
  holderName: string,
) {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    const hasBank = (account.external_accounts?.data ?? []).some(
      (item) => item.object === "bank_account",
    );
    if (hasBank) return;
  } catch {
    /* retrieve failed — tenta criar mesmo assim */
  }

  try {
    await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: "bank_account",
        country: "BR",
        currency: "brl",
        account_holder_name: holderName,
        account_holder_type: "individual",
        routing_number: "110-0000",
        account_number: "0001234",
      },
    });
  } catch (e) {
    console.warn("ensureTestConnectBankAccount:", e);
  }
}

async function pollConnectAccountUntilReady(stripe: Stripe, accountId: string) {
  let latest = await stripe.accounts.retrieve(accountId);
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (latest.charges_enabled) break;
    await sleep(2000);
    latest = await stripe.accounts.retrieve(accountId);
  }
  return latest;
}

/** Conta Connect de teste (BR) via API — sem onboarding UI. Só sk_test_. */
export async function seedTestConnectAccount(
  stripe: Stripe,
  params: { email: string; shopId: string; ownerId: string; displayName?: string | null },
  existingAccountId?: string | null,
) {
  assertStripeTestMode();

  const fields = buildTestConnectSeedFields(params);

  const finalizeTestAccount = async (accountId: string) => {
    await ensureTestConnectBankAccount(stripe, accountId, fields.holderName);
    return pollConnectAccountUntilReady(stripe, accountId);
  };

  if (existingAccountId?.trim()) {
    const existing = await stripe.accounts.retrieve(existingAccountId.trim());
    if (existing.charges_enabled) return existing;

    if (existing.type === "custom") {
      const updated = await stripe.accounts.update(existingAccountId.trim(), fields.updateParams);
      const ready = await finalizeTestAccount(updated.id);
      if (ready.charges_enabled) return ready;
    }
    // Conta Express incompleta ou custom ainda restrita → cria custom nova limpa.
  }

  const account = await stripe.accounts.create(fields.createParams);
  return finalizeTestAccount(account.id);
}

export type SeedTestConnectResult = {
  account: Stripe.Account;
  requirements_due: string[];
  pending_verification: string[];
  disabled_reason: string | null;
};

export async function seedTestConnectAccountDetailed(
  stripe: Stripe,
  params: { email: string; shopId: string; ownerId: string; displayName?: string | null },
  existingAccountId?: string | null,
): Promise<SeedTestConnectResult> {
  const account = await seedTestConnectAccount(stripe, params, existingAccountId);
  return {
    account,
    requirements_due: account.requirements?.currently_due ?? [],
    pending_verification: account.requirements?.pending_verification ?? [],
    disabled_reason: account.requirements?.disabled_reason ?? null,
  };
}

export async function createConnectAccountV1(stripe: Stripe, email: string, shopId: string, ownerId: string) {
  const account = await stripe.accounts.create({
    type: "express",
    country: "BR",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { shop_id: shopId, owner_id: ownerId, source: "sentinela_connect_v1" },
  });
  return account.id;
}

export async function createAccountLinkV1(
  stripe: Stripe,
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
) {
  const link = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export function mapConnectAccountStatus(account: Stripe.Account): string {
  // Cobrança direta na conta Connect exige apenas card_payments (charges_enabled).
  if (account.charges_enabled) return "connected";
  const disabledReason = account.requirements?.disabled_reason;
  if (disabledReason === "requirements.pending_verification") return "pending";
  if ((account.requirements?.pending_verification?.length ?? 0) > 0) return "pending";
  if (disabledReason) return "restricted";
  if (account.details_submitted) return "pending";
  return "pending";
}

export async function syncConnectAccountToShop(
  supabase: SupabaseClient,
  shopId: string,
  account: Stripe.Account,
) {
  const status = mapConnectAccountStatus(account);
  await supabase
    .from("barbershops")
    .update({
      stripe_connect_account_id: account.id,
      stripe_connect_status: status,
      stripe_connect_email: account.email ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shopId);
  return status;
}

export async function resolveConnectShopForUser(supabase: SupabaseClient, userId: string) {
  const { data: shop } = await supabase
    .from("barbershops")
    .select("id, display_name, stripe_connect_account_id, stripe_connect_status, owner_id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (!shop) return { error: "shop_not_found" as const };

  const { data: isCa } = await supabase
    .from("aggregated_accounts")
    .select("owner_user_id")
    .eq("aggregated_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (isCa?.owner_user_id) {
    const { data: titularShop } = await supabase
      .from("barbershops")
      .select("id, payments_centralized, stripe_connect_account_id, stripe_connect_status, display_name, owner_id")
      .eq("owner_id", isCa.owner_user_id)
      .maybeSingle();

    if (titularShop?.payments_centralized !== false) {
      return { error: "centralized_readonly" as const, titularShop };
    }
  }

  return { shop };
}
