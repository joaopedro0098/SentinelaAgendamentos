import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  fetchMpPayment,
  getSellerAccessToken,
  parseAppointmentExternalReference,
} from "../_shared/mpAppointment.ts";

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

    if (resourceType === "payment") {
      const mpToken = Deno.env.get("MP_ACCESS_TOKEN")!;
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      let payment: Record<string, unknown> | null = null;
      let externalReference = "";

      const { data: byMpId } = await supabase
        .from("agendamentos")
        .select("id, barbearia_id, status, payment_expires_at, mp_payment_id")
        .eq("mp_payment_id", String(resourceId))
        .maybeSingle();

      if (byMpId?.barbearia_id) {
        try {
          const { accessToken } = await getSellerAccessToken(supabase, byMpId.barbearia_id);
          payment = await fetchMpPayment(accessToken, String(resourceId));
          externalReference = String(payment.external_reference ?? "");
        } catch (e) {
          console.error("mp-webhook appointment fetch:", e);
        }
      }

      if (!payment) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
          headers: { Authorization: `Bearer ${mpToken}` },
        });
        payment = await mpRes.json();
        externalReference = String(payment?.external_reference ?? "");
      }

      console.log("payment:", payment?.status, externalReference);

      const appointmentId = parseAppointmentExternalReference(externalReference);
      if (appointmentId) {
        const mpStatus = String(payment?.status ?? "");

        if (mpStatus === "approved") {
          const { data: ag } = await supabase
            .from("agendamentos")
            .select("id, status, payment_expires_at, barbearia_id")
            .eq("id", appointmentId)
            .maybeSingle();

          if (ag?.status === "aguardando_pagamento") {
            if (ag.payment_expires_at && new Date(ag.payment_expires_at).getTime() < Date.now()) {
              await supabase.from("mp_payment_exceptions").insert({
                barbearia_id: ag.barbearia_id,
                agendamento_id: appointmentId,
                mp_payment_id: String(resourceId),
                amount_centavos: Math.round(Number(payment?.transaction_amount ?? 0) * 100),
                reason: "late_pix_after_hold_expired",
              });
            } else {
              await supabase.rpc("confirm_appointment_payment", {
                p_agendamento_id: appointmentId,
                p_mp_payment_id: String(resourceId),
              });
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-barber-new-booking`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ agendamento_id: appointmentId }),
              }).catch(() => undefined);
            }
          }
        } else if (mpStatus === "rejected" || mpStatus === "cancelled") {
          const methodId = String(payment?.payment_method_id ?? payment?.payment_type_id ?? "");
          const isPix = methodId === "pix" || methodId === "bank_transfer";
          if (!isPix) {
            await supabase.rpc("fail_appointment_payment", {
              p_agendamento_id: appointmentId,
              p_mp_payment_id: String(resourceId),
            });
          }
        }

        return new Response(
          debug ? JSON.stringify({ ok: true, action: "appointment_payment", status: mpStatus }) : "ok",
          { status: 200, headers: debug ? { ...corsHeaders, "Content-Type": "application/json" } : corsHeaders },
        );
      }

      if (String(payment?.status ?? "") !== "approved") {
        return new Response(
          debug
            ? JSON.stringify({
                ok: true,
                action: "ignored_not_approved",
                payment_id: resourceId,
                status: payment?.status,
                status_detail: payment?.status_detail,
                external_reference: payment?.external_reference,
              })
            : "ok",
          { status: 200, headers: debug ? { ...corsHeaders, "Content-Type": "application/json" } : corsHeaders },
        );
      }

      const pixExternalReference = String(payment?.external_reference ?? "");
      const shopId = pixExternalReference.startsWith("barbershop_pix:")
        ? pixExternalReference.replace("barbershop_pix:", "")
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
          last_payment_method: "pix",
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
