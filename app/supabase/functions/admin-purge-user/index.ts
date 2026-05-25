import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function purgeUserCompletely(admin: SupabaseClient, userId: string, userEmail: string | null) {
  const normEmail = userEmail?.trim().toLowerCase() ?? null;

  if (normEmail) {
    await admin.from("trial_claims").delete().eq("email", normEmail);
  }

  await admin.from("facial_embeddings").delete().eq("user_id", userId);

  const { data: shops } = await admin.from("barbershops").select("id, slug, avatar_url").eq("owner_id", userId);

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
        await admin.from("barbeiro_services").delete().in("barbeiro_id", barbeiroIds);
        await admin.from("bloqueios").delete().in("barbeiro_id", barbeiroIds);
        await admin.from("disponibilidades").delete().in("barbeiro_id", barbeiroIds);
      }
      await admin.from("agendamentos").delete().in("barbearia_id", barbeariaIds);
      await admin.from("barbeiros").delete().in("barbearia_id", barbeariaIds);
      await admin.from("barbearias").delete().in("id", barbeariaIds);
    }

    if (shop.avatar_url && shop.avatar_url.includes("/barbershop-avatars/")) {
      const path = shop.avatar_url.split("/barbershop-avatars/")[1]?.split("?")[0];
      if (path) {
        await admin.storage.from("barbershop-avatars").remove([decodeURIComponent(path)]);
      }
    }
  }

  await admin.from("barbershops").delete().eq("owner_id", userId);
  await admin.from("profiles").delete().eq("id", userId);
  await admin.from("user_roles").delete().eq("user_id", userId);

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) throw new Error(delErr.message);
}

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
    const { data: callerData, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !callerData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: callerData.user.id,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const targetEmail = body.email?.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes("@")) {
      return new Response(JSON.stringify({ error: "E-mail inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (callerData.user.email?.trim().toLowerCase() === targetEmail) {
      return new Response(JSON.stringify({ error: "Não é possível excluir sua própria conta admin por aqui." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string | null = null;

    const { data: profile } = await admin.from("profiles").select("id").ilike("email", targetEmail).maybeSingle();
    if (profile?.id) {
      userId = profile.id;
    } else {
      const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = listData.users.find((u) => u.email?.trim().toLowerCase() === targetEmail);
      userId = match?.id ?? null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await purgeUserCompletely(admin, userId, targetEmail);

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
