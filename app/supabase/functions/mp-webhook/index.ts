import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

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

async function notifyOwner(
  supabase: ReturnType<typeof createClient>,
  shopId: string,
  email: string | undefined,
  subject: string,
  body: string,
  notice: string,
) {
  await supabase
    .from("barbershops")
    .update({ subscription_notice: notice })
    .eq("id", shopId);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM") ?? "Sentinela <noreply@sentinelagendamentos.com>";
  if (!resendKey || !email) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [email], subject, html: `<p>${body}</p>` }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";
    const topic = url.searchParams.get("topic") || url.searchParams.get("type");
    const idQs = url.searchParams.get("id") || url.searchParams.get("data.id");

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      /* ignore */
    }

    const resourceId = (payload?.data as { id?: string })?.id || idQs;
    const resourceType = (payload?.type as string) || topic;

    if (!resourceId) {
      return new Response(debug ? JSON.stringify({ ok: true, ignored: "missing_resource_id" }) : "ok", {
        status: 200,
        headers: debug ? { ...corsHeaders, "Content-Type": "application/json" } : corsHeaders,
      });
    }

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (resourceType === "preapproval" || resourceType === "subscription_preapproval") {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      const sub = await mpRes.json();
      console.log("preapproval:", sub.status, sub.external_reference);

      const shopId = sub.external_reference as string | undefined;
      let shopQuery = supabase.from("barbershops").select("id, owner_id");
      if (shopId) shopQuery = shopQuery.eq("id", shopId);
      else shopQuery = shopQuery.eq("mp_subscription_id", sub.id);

      const { data: shop } = await shopQuery.maybeSingle();
      if (!shop) return new Response("ok", { status: 200, headers: corsHeaders });

      const { data: owner } = await supabase.auth.admin.getUserById(shop.owner_id);
      const email = owner?.user?.email;

      const status = sub.status as string;
      const nextPayment = sub.next_payment_date ? String(sub.next_payment_date).slice(0, 10) : null;

      if (status === "authorized") {
        await supabase
          .from("barbershops")
          .update({
            subscription_status: "active",
            mp_subscription_id: sub.id,
            current_period_end: nextPayment,
            grace_until: null,
            subscription_notice: null,
          })
          .eq("id", shop.id);
      } else if (status === "paused" || status === "pending") {
        const graceUntil = new Date();
        graceUntil.setDate(graceUntil.getDate() + 3);
        const graceStr = graceUntil.toISOString().slice(0, 10);
        const notice =
          "Pagamento pendente. Você tem 3 dias para regularizar antes de bloquear novos agendamentos.";
        await supabase
          .from("barbershops")
          .update({
            subscription_status: "grace",
            grace_until: graceStr,
            subscription_notice: notice,
          })
          .eq("id", shop.id);
        await notifyOwner(
          supabase,
          shop.id,
          email,
          "Sentinela — pagamento pendente",
          notice,
          notice,
        );
      } else if (status === "cancelled") {
        const periodEnd = nextPayment ?? new Date().toISOString().slice(0, 10);
        const notice = "Assinatura cancelada. O acesso continua até o fim do período já pago.";
        await supabase
          .from("barbershops")
          .update({
            subscription_status: "cancelled",
            current_period_end: periodEnd,
            subscription_notice: notice,
          })
          .eq("id", shop.id);
        await notifyOwner(supabase, shop.id, email, "Sentinela — assinatura cancelada", notice, notice);
      } else {
        await supabase
          .from("barbershops")
          .update({
            subscription_status: "expired",
            subscription_notice: "Assinatura inativa. Assine novamente em Perfil para liberar agendamentos.",
          })
          .eq("id", shop.id);
      }
    } else if (resourceType === "payment") {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      const payment = await mpRes.json();
      console.log("payment:", payment.status, payment.external_reference);

      if (payment.status !== "approved") {
        return new Response(
          debug
            ? JSON.stringify({
                ok: true,
                action: "ignored_not_approved",
                payment_id: resourceId,
                status: payment.status,
                status_detail: payment.status_detail,
                external_reference: payment.external_reference,
              })
            : "ok",
          { status: 200, headers: debug ? { ...corsHeaders, "Content-Type": "application/json" } : corsHeaders },
        );
      }

      const externalReference = String(payment.external_reference ?? "");
      const shopId = externalReference.startsWith("barbershop_pix:")
        ? externalReference.replace("barbershop_pix:", "")
        : "";

      if (!shopId) {
        return new Response(
          debug
            ? JSON.stringify({
                ok: true,
                action: "ignored_invalid_external_reference",
                payment_id: resourceId,
                status: payment.status,
                external_reference: payment.external_reference,
              })
            : "ok",
          { status: 200, headers: debug ? { ...corsHeaders, "Content-Type": "application/json" } : corsHeaders },
        );
      }

      const { data: shop } = await supabase
        .from("barbershops")
        .select("id, current_period_end")
        .eq("id", shopId)
        .maybeSingle();

      if (!shop) {
        return new Response(
          debug
            ? JSON.stringify({
                ok: true,
                action: "ignored_shop_not_found",
                payment_id: resourceId,
                status: payment.status,
                external_reference: payment.external_reference,
                shop_id: shopId,
              })
            : "ok",
          { status: 200, headers: debug ? { ...corsHeaders, "Content-Type": "application/json" } : corsHeaders },
        );
      }

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

      if (debug) {
        return new Response(
          JSON.stringify({
            ok: true,
            action: "activated_pix_payment",
            payment_id: resourceId,
            status: payment.status,
            external_reference: payment.external_reference,
            shop_id: shop.id,
            current_period_end: periodEnd,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("webhook error:", e);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
});
