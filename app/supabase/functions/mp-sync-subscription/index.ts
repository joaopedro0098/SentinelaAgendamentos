import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findLatestPreapproval, getPreapproval } from "../_shared/mpPreapproval.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getNextPeriodEnd(currentPeriodEnd: string | null | undefined) {
  const today = new Date();
  const current = currentPeriodEnd ? new Date(`${currentPeriodEnd}T00:00:00Z`) : null;
  const base = current && current > today ? current : today;
  return toDateOnly(addDays(base, 30));
}

type ShopRow = {
  id: string;
  owner_id: string;
  mp_subscription_id: string | null;
  current_period_end: string | null;
  subscription_status: string | null;
};

function hadPaidCardSubscription(status: string | null | undefined) {
  return status === "active" || status === "grace" || status === "cancelled";
}

async function applyPreapprovalToShop(
  supabase: SupabaseClient,
  shop: ShopRow,
  sub: { id?: string; status?: string; next_payment_date?: string },
) {
  const status = String(sub.status ?? "");
  const nextPayment = sub.next_payment_date ? String(sub.next_payment_date).slice(0, 10) : null;

  if (status === "authorized") {
    await supabase
      .from("barbershops")
      .update({
        subscription_status: "active",
        mp_subscription_id: sub.id ?? shop.mp_subscription_id,
        current_period_end: nextPayment,
        grace_until: null,
        subscription_notice: null,
      })
      .eq("id", shop.id);
    return "active";
  }

  if (status === "paused" || status === "pending") {
    if (hadPaidCardSubscription(shop.subscription_status)) {
      const graceStr = toDateOnly(addDays(new Date(), 3));
      await supabase
        .from("barbershops")
        .update({
          subscription_status: "grace",
          grace_until: graceStr,
          subscription_notice:
            "Pagamento pendente. Você tem 3 dias para regularizar antes de bloquear novos agendamentos.",
        })
        .eq("id", shop.id);
      return "grace";
    }

    await supabase
      .from("barbershops")
      .update({
        mp_subscription_id: null,
        subscription_notice: "Complete o pagamento no Mercado Pago para ativar sua assinatura.",
      })
      .eq("id", shop.id);
    return shop.subscription_status ?? "trial";
  }

  if (status === "cancelled") {
    const periodEnd = nextPayment ?? toDateOnly(new Date());
    await supabase
      .from("barbershops")
      .update({
        subscription_status: "cancelled",
        mp_subscription_id: null,
        current_period_end: periodEnd,
        subscription_notice: "Assinatura cancelada. O acesso continua até o fim do período já pago.",
      })
      .eq("id", shop.id);
    return "cancelled";
  }

  await supabase
    .from("barbershops")
    .update({
      subscription_status: "expired",
      mp_subscription_id: null,
      subscription_notice: "Assinatura inativa. Assine novamente em Perfil para liberar agendamentos.",
    })
    .eq("id", shop.id);
  return "expired";
}

async function syncShopFromMercadoPago(
  supabase: SupabaseClient,
  mpToken: string,
  shop: ShopRow,
): Promise<{ synced: boolean; mp_status?: string; subscription_status?: string }> {
  let preapprovalId = shop.mp_subscription_id;
  let sub: { id?: string; status?: string; next_payment_date?: string } | null = null;

  if (preapprovalId) {
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    sub = await mpRes.json();
    if (!mpRes.ok) {
      throw new Error(sub?.message ?? "Não foi possível consultar assinatura no Mercado Pago.");
    }
  } else {
    const found = await findLatestPreapproval(mpToken, shop.id);
    preapprovalId = found?.id ?? null;
    if (!preapprovalId) {
      return { synced: false };
    }
    sub = (await getPreapproval(mpToken, preapprovalId)) ?? found;
  }

  const subscriptionStatus = await applyPreapprovalToShop(supabase, shop, sub);
  return { synced: true, mp_status: String(sub.status ?? ""), subscription_status: subscriptionStatus };
}

async function syncRecentPixPayment(
  supabase: SupabaseClient,
  mpToken: string,
  shop: ShopRow,
): Promise<{ synced: boolean; subscription_status?: string }> {
  const searchRes = await fetch(
    `https://api.mercadopago.com/v1/payments/search?external_reference=barbershop_pix:${shop.id}&sort=date_created&criteria=desc&limit=5`,
    { headers: { Authorization: `Bearer ${mpToken}` } },
  );
  const searchData = await searchRes.json();
  if (!searchRes.ok) return { synced: false };

  const payments = (searchData.results ?? []) as Array<{ status?: string }>;
  const approved = payments.find((p) => p.status === "approved");
  if (!approved) return { synced: false };

  const periodEnd = getNextPeriodEnd(shop.current_period_end);
  await supabase
    .from("barbershops")
    .update({
      subscription_status: "active",
      current_period_end: periodEnd,
      grace_until: null,
      subscription_notice: null,
    })
    .eq("id", shop.id);

  return { synced: true, subscription_status: "active" };
}

async function resolveShop(supabase: SupabaseClient, ownerId: string): Promise<ShopRow | null> {
  const { data: shop } = await supabase
    .from("barbershops")
    .select("id, owner_id, mp_subscription_id, current_period_end, subscription_status")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return shop;
}

async function resolveOwnerIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("admin_get_user_id_by_email", {
    p_email: email.trim().toLowerCase(),
  });
  if (error || !data) return null;
  return String(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autenticado" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: callerData, error: callerErr } = await supabase.auth.getUser(token);
    if (callerErr || !callerData.user) return jsonResponse({ error: "Sessão inválida" }, 401);

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const targetEmail = body.email?.trim().toLowerCase();

    let ownerId = callerData.user.id;
    let lookupEmail = callerData.user.email ?? "";

    if (targetEmail) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: callerData.user.id,
        _role: "admin",
      });
      if (!isAdmin) return jsonResponse({ error: "Acesso negado" }, 403);
      ownerId = (await resolveOwnerIdByEmail(supabase, targetEmail)) ?? "";
      if (!ownerId) return jsonResponse({ error: "Usuário não encontrado" }, 404);
      lookupEmail = targetEmail;
    }

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN")?.trim();
    if (!mpToken) return jsonResponse({ error: "Mercado Pago não configurado." }, 503);

    const shop = await resolveShop(supabase, ownerId);
    if (!shop) {
      if (targetEmail) {
        const { data: lookup } = await userClient.rpc("admin_lookup_user_by_email", {
          p_email: lookupEmail,
        });
        return jsonResponse({ ok: true, synced: false, subscription: lookup });
      }
      return jsonResponse({ error: "Empresa não encontrada" }, 404);
    }

    let result: { synced: boolean; mp_status?: string; subscription_status?: string } = { synced: false };

    result = await syncShopFromMercadoPago(supabase, mpToken, shop);

    if (!result.synced || result.subscription_status !== "active") {
      const pixResult = await syncRecentPixPayment(supabase, mpToken, shop);
      if (pixResult.synced) result = { synced: true, subscription_status: pixResult.subscription_status };
    }

    const isAdminLookup = Boolean(targetEmail);
    if (isAdminLookup) {
      const { data: lookup } = await userClient.rpc("admin_lookup_user_by_email", {
        p_email: lookupEmail,
      });
      return jsonResponse({
        ok: true,
        synced: result.synced,
        mp_status: result.mp_status ?? null,
        subscription: lookup,
      });
    }

    const { data: subscription } = await userClient.rpc("get_my_subscription");
    return jsonResponse({
      ok: true,
      synced: result.synced,
      mp_status: result.mp_status ?? null,
      subscription,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
