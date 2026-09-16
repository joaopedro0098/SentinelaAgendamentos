/**
 * Backfill TTL (43200s) em templates Sentinela APPROVED na Meta.
 *
 * 1) Dry-run em um template (local UUID em whatsapp_waba_message_templates):
 *   $env:SUPABASE_URL="..."
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."
 *   $env:LOCAL_TEMPLATE_ID="<uuid>"
 *   node supabase/scripts/backfill-meta-template-ttl.mjs
 *
 * 2) Aplicar no mesmo template:
 *   $env:APPLY="1"
 *   node supabase/scripts/backfill-meta-template-ttl.mjs
 *
 * 3) Todos os shops (dry-run, depois APPLY=1):
 *   $env:ALL_SHOPS="1"
 *   node supabase/scripts/backfill-meta-template-ttl.mjs
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const localTemplateId = process.env.LOCAL_TEMPLATE_ID?.trim();
const barbershopId = process.env.SHOP_ID?.trim();
const allShops = process.env.ALL_SHOPS === "1";
const apply = process.env.APPLY === "1";

if (!supabaseUrl || !serviceKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!localTemplateId && !barbershopId && !allShops) {
  console.error("Defina LOCAL_TEMPLATE_ID, SHOP_ID ou ALL_SHOPS=1.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey);

async function main() {
  const payload = {
    dry_run: !apply,
    ...(localTemplateId ? { local_template_id: localTemplateId } : {}),
    ...(barbershopId ? { barbershop_id: barbershopId } : {}),
    ...(allShops ? { all_shops: true } : {}),
  };

  console.log("Invoke meta-waba-template-ttl-backfill", payload);

  const { data, error } = await admin.functions.invoke("meta-waba-template-ttl-backfill", {
    body: payload,
  });

  if (error) {
    console.error("FAIL:", error.message, data);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
  if (!data?.ok && apply) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
