import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  detachUnusedCustomerPaymentMethods,
  getOrCreateStripeCustomer,
  getStripeClient,
  resolveDefaultPaymentMethod,
  setupIntentClientSecret,
  syncShopFromStripeSubscription,
} from "../_shared/stripePlatformBilling.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function paymentMethodIdFromSetupIntent(setupIntent: { payment_method?: string | { id?: string } | null }) {
  const paymentMethod = setupIntent.payment_method;
  if (!paymentMethod) return null;
  return typeof paymentMethod === "string" ? paymentMethod : paymentMethod.id ?? null;
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

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
    const user = userData.user;

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin) return jsonResponse({ error: "Conta administrativa não possui assinatura." }, 400);

    if (!user.email?.trim()) {
      return jsonResponse({ error: "Sua conta precisa de um e-mail válido." }, 400);
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      setup_intent_id?: string;
      reactivate?: boolean;
    };
    const action = body.action?.trim();

    const { data: shop } = await supabase
      .from("barbershops")
      .select(
        "id, display_name, stripe_customer_id, stripe_subscription_id, last_payment_method, subscription_status",
      )
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!shop) return jsonResponse({ error: "Empresa não encontrada" }, 404);

    if (!shop.stripe_subscription_id?.trim()) {
      return jsonResponse({ error: "Nenhuma assinatura Stripe ativa encontrada." }, 400);
    }

    if (shop.last_payment_method !== "card") {
      return jsonResponse({ error: "Atualização de cartão disponível apenas para assinaturas via Stripe." }, 400);
    }

    const stripe = getStripeClient();

    if (action === "start") {
      const customer = await getOrCreateStripeCustomer(stripe, {
        email: user.email,
        shopId: shop.id,
        displayName: shop.display_name,
        existingCustomerId: shop.stripe_customer_id,
      });

      if (customer.id !== shop.stripe_customer_id) {
        await supabase.from("barbershops").update({ stripe_customer_id: customer.id }).eq("id", shop.id);
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: { shop_id: shop.id },
      });

      const clientSecret = setupIntentClientSecret(setupIntent);
      if (!clientSecret) {
        return jsonResponse({ error: "Stripe não retornou confirmação do cartão." }, 502);
      }

      return jsonResponse({ ok: true, client_secret: clientSecret });
    }

    if (action === "complete") {
      const setupIntentId = body.setup_intent_id?.trim();
      if (!setupIntentId) return jsonResponse({ error: "setup_intent_id é obrigatório." }, 400);

      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      if (setupIntent.status !== "succeeded") {
        return jsonResponse({ error: "Confirmação do cartão ainda não concluída." }, 400);
      }

      const shopIdFromMeta = setupIntent.metadata?.shop_id?.trim();
      if (shopIdFromMeta && shopIdFromMeta !== shop.id) {
        return jsonResponse({ error: "Cartão não pertence a esta conta." }, 403);
      }

      const paymentMethodId = paymentMethodIdFromSetupIntent(setupIntent);
      if (!paymentMethodId) {
        return jsonResponse({ error: "Stripe não retornou o método de pagamento." }, 502);
      }

      const customerId =
        typeof setupIntent.customer === "string"
          ? setupIntent.customer
          : setupIntent.customer?.id ?? shop.stripe_customer_id;
      if (!customerId) {
        return jsonResponse({ error: "Cliente Stripe não encontrado." }, 400);
      }

      const { paymentMethodId: defaultPaymentMethodId } = await resolveDefaultPaymentMethod(
        stripe,
        customerId,
        paymentMethodId,
      );

      await detachUnusedCustomerPaymentMethods(stripe, customerId, defaultPaymentMethodId);

      const reactivate = Boolean(body.reactivate);
      const updated = await stripe.subscriptions.update(shop.stripe_subscription_id, {
        default_payment_method: defaultPaymentMethodId,
        ...(reactivate ? { cancel_at_period_end: false } : {}),
      });

      await syncShopFromStripeSubscription(supabase, shop.id, updated);

      return jsonResponse({
        ok: true,
        reactivated: reactivate,
        subscription_id: updated.id,
      });
    }

    return jsonResponse({ error: "Ação inválida. Use start ou complete." }, 400);
  } catch (e) {
    console.error("stripe-update-payment-method:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
