/**
 * Smoke manual: templates Meta (sync) para barbearia Meta Direct já conectada.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SHOP_ID=... node supabase/scripts/smoke-meta-waba-message-templates.mjs
 *
 * Opcional (simula JWT de owner via invoke autenticado — preferir teste via UI):
 *   OWNER_JWT=... (token do profissional logado)
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const shopId = process.env.SHOP_ID?.trim();
const ownerJwt = process.env.OWNER_JWT?.trim();

if (!supabaseUrl || !serviceKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey);

async function main() {
  let query = admin.from("barbershops").select(
    "id, owner_id, waba_id, waba_connect_status, whatsapp_messaging_provider, waba_access_token_encrypted",
  );

  if (shopId) query = query.eq("id", shopId);
  else query = query.eq("whatsapp_messaging_provider", "meta").eq("waba_connect_status", "connected");

  const { data: shop, error } = await query.maybeSingle();
  if (error || !shop) {
    console.error("Barbearia Meta conectada não encontrada.", error?.message);
    process.exit(1);
  }

  console.log("Shop:", shop.id);
  console.log("WABA:", shop.waba_id);
  console.log("Token encrypted:", Boolean(shop.waba_access_token_encrypted));

  if (!shop.waba_id || !shop.waba_access_token_encrypted) {
    console.error("FAIL: dados Meta incompletos — reconexão necessária.");
    process.exit(1);
  }

  if (!ownerJwt) {
    console.log("OK (pré-check DB): barbearia já conectada tem waba_id + token. Invoke sync via UI ou OWNER_JWT.");
    process.exit(0);
  }

  const userClient = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY ?? "", {
    global: { headers: { Authorization: `Bearer ${ownerJwt}` } },
  });

  const { data, error: fnErr } = await userClient.functions.invoke("meta-waba-message-templates", {
    body: { action: "sync" },
  });

  if (fnErr) {
    console.error("FAIL sync:", fnErr.message, data);
    process.exit(1);
  }

  console.log("Sync result:", JSON.stringify(data, null, 2));
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
