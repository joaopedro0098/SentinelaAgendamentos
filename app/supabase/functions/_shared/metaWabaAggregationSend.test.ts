/**
 * Rodar: deno test app/supabase/functions/_shared/metaWabaAggregationSend.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  chooseMetaSendShopId,
  isMetaConnectedShop,
  isShopSendableForKind,
  type BarbershopMessagingRow,
} from "./metaWabaAggregationSend.ts";

function shop(partial: Partial<BarbershopMessagingRow> & Pick<BarbershopMessagingRow, "id">): BarbershopMessagingRow {
  return {
    slug: "slug",
    owner_id: "owner",
    whatsapp_messaging_provider: "meta",
    waba_connect_status: "connected",
    waba_phone_number_id: "123",
    waba_access_token_encrypted: "enc",
    ...partial,
  };
}

Deno.test("chooseMetaSendShopId — loja isolada sendable usa S", () => {
  assertEquals(
    chooseMetaSendShopId({
      selectedShopId: "s1",
      partnerShopId: null,
      selectedSendable: true,
      partnerSendable: false,
    }),
    "s1",
  );
});

Deno.test("chooseMetaSendShopId — regra 3: ambas sendable usa S", () => {
  assertEquals(
    chooseMetaSendShopId({
      selectedShopId: "ca",
      partnerShopId: "ct",
      selectedSendable: true,
      partnerSendable: true,
    }),
    "ca",
  );
});

Deno.test("chooseMetaSendShopId — CA sem template, CT sendable empresta CT", () => {
  assertEquals(
    chooseMetaSendShopId({
      selectedShopId: "ca",
      partnerShopId: "ct",
      selectedSendable: false,
      partnerSendable: true,
    }),
    "ct",
  );
});

Deno.test("chooseMetaSendShopId — CT sem template, CA sendable empresta CA", () => {
  assertEquals(
    chooseMetaSendShopId({
      selectedShopId: "ct",
      partnerShopId: "ca",
      selectedSendable: false,
      partnerSendable: true,
    }),
    "ca",
  );
});

Deno.test("chooseMetaSendShopId — nenhum sendable retorna null", () => {
  assertEquals(
    chooseMetaSendShopId({
      selectedShopId: "ca",
      partnerShopId: "ct",
      selectedSendable: false,
      partnerSendable: false,
    }),
    null,
  );
});

Deno.test("isMetaConnectedShop — exige meta connected com credenciais", () => {
  assertEquals(isMetaConnectedShop(shop({ id: "a" })), true);
  assertEquals(
    isMetaConnectedShop(shop({ id: "b", whatsapp_messaging_provider: "twilio" })),
    false,
  );
  assertEquals(isMetaConnectedShop(shop({ id: "c", waba_connect_status: "pending" })), false);
});

Deno.test("isShopSendableForKind — template aprovado na categoria", () => {
  const connected = shop({ id: "shop-1" });
  const templates = new Set(["shop-1"]);
  assertEquals(isShopSendableForKind(connected, templates), true);
  assertEquals(isShopSendableForKind(connected, new Set()), false);
  assertEquals(
    isShopSendableForKind(shop({ id: "x", whatsapp_messaging_provider: "twilio" }), templates),
    false,
  );
});
