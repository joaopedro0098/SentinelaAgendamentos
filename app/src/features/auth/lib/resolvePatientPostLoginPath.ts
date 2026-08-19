import { supabase } from "@/integrations/supabase/client";
import { getPatientPostLoginPath } from "@/features/auth/lib/postLoginPaths";

export const PATIENT_NOT_LINKED_MESSAGE =
  "Sua conta não está vinculada a nenhuma clínica. Peça o link de ativação à clínica onde você está cadastrado.";

export type ResolvePatientLoginResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

type ClienteRow = {
  barbearia_id: string;
  updated_at: string | null;
};

type BarbeariaRow = {
  slug: string | null;
  ativa: boolean | null;
};

export async function resolvePatientPostLoginPath(
  userId: string,
  from?: { pathname?: string; search?: string } | null,
): Promise<ResolvePatientLoginResult> {
  const fromPath = getPatientPostLoginPath(from);
  if (fromPath !== "/") {
    return { ok: true, path: fromPath };
  }

  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("barbearia_id, updated_at")
    .eq("auth_user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (clientesError) {
    return { ok: false, error: clientesError.message };
  }

  const rows = (clientes ?? []) as ClienteRow[];
  if (rows.length === 0) {
    return { ok: false, error: PATIENT_NOT_LINKED_MESSAGE };
  }

  const barbeariaIds = [...new Set(rows.map((row) => row.barbearia_id).filter(Boolean))];
  if (barbeariaIds.length === 0) {
    return { ok: false, error: PATIENT_NOT_LINKED_MESSAGE };
  }

  const { data: barbearias, error: barbeariasError } = await supabase
    .from("barbearias")
    .select("id, slug, ativa")
    .in("id", barbeariaIds)
    .eq("ativa", true);

  if (barbeariasError) {
    return { ok: false, error: barbeariasError.message };
  }

  const shopById = new Map(
    ((barbearias ?? []) as (BarbeariaRow & { id: string })[]).map((shop) => [shop.id, shop]),
  );

  for (const row of rows) {
    const shop = shopById.get(row.barbearia_id);
    const slug = shop?.slug?.trim();
    if (shop?.ativa && slug) {
      return { ok: true, path: `/agendar/${encodeURIComponent(slug)}` };
    }
  }

  return { ok: false, error: PATIENT_NOT_LINKED_MESSAGE };
}
