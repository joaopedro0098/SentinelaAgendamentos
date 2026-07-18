import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function readExtensionToken(req: Request): string | null {
  const auth = req.headers.get("Authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim() || null;
  }
  return req.headers.get("x-sentinela-token")?.trim() || null;
}

export async function resolveExtensionConnectUser(
  supabase: SupabaseClient,
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  const token = readExtensionToken(req);
  if (!token || !token.startsWith("sc_live_")) {
    return { ok: false, status: 401, message: "Token inválido ou ausente." };
  }

  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase.rpc("validate_extension_connect_token", {
    p_token_hash: tokenHash,
  });

  if (error) {
    console.error("validate_extension_connect_token:", error.message);
    return { ok: false, status: 500, message: "Falha ao validar token." };
  }

  const row = data as { valid?: boolean; user_id?: string } | null;
  if (!row?.valid || !row.user_id) {
    return { ok: false, status: 401, message: "Token inválido ou revogado." };
  }

  return { ok: true, userId: row.user_id };
}
