import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email?.trim().toLowerCase();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (userEmail) {
      await admin.from("trial_claims").upsert(
        { email: userEmail, user_id: userId, claimed_at: new Date().toISOString() },
        { onConflict: "email" },
      );
    }

    const { data: shops } = await admin.from("barbershops").select("id, slug").eq("owner_id", userId);

    for (const shop of shops ?? []) {
      const { data: staffRows } = await admin.from("staff").select("id").eq("barbershop_id", shop.id);
      const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id);
      if (staffIds.length > 0) {
        await admin.from("staff_schedules").delete().in("staff_id", staffIds);
        await admin.from("staff_services").delete().in("staff_id", staffIds);
      }
      await admin.from("staff").delete().eq("barbershop_id", shop.id);
      await admin.from("conversations").delete().eq("barbershop_id", shop.id);

      const { data: barbearias } = await admin.from("barbearias").select("id").eq("slug", shop.slug);
      const barbeariaIds = (barbearias ?? []).map((b: { id: string }) => b.id);

      if (barbeariaIds.length > 0) {
        const { data: barbeiros } = await admin.from("barbeiros").select("id").in("barbearia_id", barbeariaIds);
        const barbeiroIds = (barbeiros ?? []).map((b: { id: string }) => b.id);
        if (barbeiroIds.length > 0) {
          await admin.from("bloqueios").delete().in("barbeiro_id", barbeiroIds);
          await admin.from("disponibilidades").delete().in("barbeiro_id", barbeiroIds);
        }
        await admin.from("agendamentos").delete().in("barbearia_id", barbeariaIds);
        await admin.from("barbeiros").delete().in("barbearia_id", barbeariaIds);
        await admin.from("barbearias").delete().in("id", barbeariaIds);
      }
    }

    await admin.from("barbershops").delete().eq("owner_id", userId);
    await admin.from("facial_embeddings").update({ user_id: null }).eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.from("user_roles").delete().eq("user_id", userId);

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
