import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  activateShopSubscription,
  buildMpWebhookEventKey,
  claimMpWebhookEvent,
  fetchMpPreapproval,
  getNextSubscriptionPeriodEnd,
  getPlatformMpAccessToken,
  normalizePreapprovalFailureStatus,
  parsePlanPixExternalReference,
  parsePreapprovalExternalReference,
  preapprovalFailureNotice,
} from "../_shared/mpPlatformBilling.ts";
import {
  fetchMpPayment,
  getSellerAccessToken,
  parseAppointmentExternalReference,
  finalizeExpiredPaymentHoldsBatch,
  deleteAppointmentPaymentHold,
  promoteAppointmentPaymentIfSlotAvailable,
} from "../_shared/mpAppointment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

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

    if (resourceType === "subscription_preapproval" || resourceType === "preapproval") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      try {
        const preapproval = await fetchMpPreapproval(String(resourceId));
        const { shopId, tier } = parsePreapprovalExternalReference(preapproval.external_reference);
        const mpStatus = String(preapproval.status ?? "").toLowerCase();
        const action = typeof payload.action === "string" ? payload.action : null;
        const notificationId = (payload.id as string | number | undefined) ?? null;

        const eventKey = buildMpWebhookEventKey({
          notificationId,
          resourceType: String(resourceType),
          resourceId: String(resourceId),
          action,
          resourceStatus: mpStatus || "unknown",
        });

        const claimed = await claimMpWebhookEvent(supabase, eventKey, {
          resource_type: String(resourceType),
          resource_id: String(resourceId),
          resource_status: mpStatus || "unknown",
        });

        if (!claimed) {
          if (debug) {
            return new Response(
              JSON.stringify({ ok: true, action: "preapproval_duplicate_ignored", event_key: eventKey }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          return new Response("ok", { status: 200, headers: corsHeaders });
        }

        if (shopId) {
          const { data: shop } = await supabase
            .from("barbershops")
            .select("id, current_period_end, subscription_status, mp_subscription_id")
            .eq("id", shopId)
            .maybeSingle();

          if (shop) {
            if (mpStatus === "authorized") {
              const alreadyActive =
                shop.subscription_status === "active" &&
                shop.mp_subscription_id === String(resourceId) &&
                shop.current_period_end != null;

              if (!alreadyActive) {
                if (tier) {
                  await activateShopSubscription(supabase, shop.id, {
                    tier,
                    lastPaymentMethod: "mp_sub",
                    mpSubscriptionId: String(resourceId),
                    currentPeriodEnd: shop.current_period_end,
                  });
                } else {
                  const periodEnd = getNextSubscriptionPeriodEnd(shop.current_period_end);
                  await supabase
                    .from("barbershops")
                    .update({
                      subscription_status: "active",
                      mp_subscription_id: String(resourceId),
                      last_payment_method: "mp_sub",
                      current_period_end: periodEnd,
                      grace_until: null,
                      subscription_notice: null,
                    })
                    .eq("id", shop.id);
                }
              }
            } else {
              const failureStatus = normalizePreapprovalFailureStatus(mpStatus);
              if (failureStatus) {
                const update: Record<string, unknown> = {
                  subscription_notice: preapprovalFailureNotice(failureStatus),
                };

                if (shop.subscription_status === "trial") {
                  update.mp_subscription_id = null;
                } else if (failureStatus === "cancelled") {
                  update.subscription_status = "cancelled";
                  update.mp_subscription_id = String(resourceId);
                }

                await supabase.from("barbershops").update(update).eq("id", shop.id);
              }
            }
          }
        }

        if (debug) {
          return new Response(
            JSON.stringify({
              ok: true,
              action: "preapproval",
              event_key: eventKey,
              preapproval_id: resourceId,
              status: preapproval.status,
              shop_id: shopId,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        console.error("mp-webhook preapproval:", e);
      }

      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (resourceType === "payment") {
      const mpToken = getPlatformMpAccessToken();
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      void finalizeExpiredPaymentHoldsBatch(supabase, 5);

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
            const promoted = await promoteAppointmentPaymentIfSlotAvailable(
              supabase,
              appointmentId,
              String(resourceId),
            );
            if (promoted.confirmed || promoted.already_confirmed) {
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
            await deleteAppointmentPaymentHold(supabase, appointmentId);
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
      const planPix = parsePlanPixExternalReference(pixExternalReference);

      if (planPix.shopId && planPix.tier) {
        const { data: shop } = await supabase
          .from("barbershops")
          .select("id, current_period_end")
          .eq("id", planPix.shopId)
          .maybeSingle();

        if (shop) {
          await activateShopSubscription(supabase, shop.id, {
            tier: planPix.tier,
            lastPaymentMethod: "pix",
            currentPeriodEnd: shop.current_period_end,
          });

          if (debug) {
            return new Response(
              JSON.stringify({
                ok: true,
                action: "activated_plan_pix",
                payment_id: resourceId,
                shop_id: shop.id,
                tier: planPix.tier,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        return new Response("ok", { status: 200, headers: corsHeaders });
      }

      return new Response(
        debug
          ? JSON.stringify({
              ok: true,
              action: "ignored_unknown_platform_payment",
              payment_id: resourceId,
              status: payment?.status,
              external_reference: pixExternalReference,
            })
          : "ok",
        { status: 200, headers: debug ? { ...corsHeaders, "Content-Type": "application/json" } : corsHeaders },
      );
    }

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("webhook error:", e);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
});
