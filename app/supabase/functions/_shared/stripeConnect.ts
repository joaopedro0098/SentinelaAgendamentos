import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
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
  const transfers = account.capabilities?.transfers;
  if (transfers === "active") return true;
  // Algumas contas v2 expõem legacy_payments enquanto migram capabilities.
  return account.capabilities?.legacy_payments === "active";
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
  const canTransfer = accountCanReceiveDestinationCharges(account);
  if (account.charges_enabled && canTransfer) return "connected";
  if (account.charges_enabled && !canTransfer) return "pending";
  if (account.requirements?.disabled_reason) return "restricted";
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
