import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "agendamento-comprovantes";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isSvgText(bytes: Uint8Array): boolean {
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 4096)));
  const trimmed = sample.trim().toLowerCase();
  return trimmed.includes("<svg") && (trimmed.startsWith("<") || trimmed.startsWith("<?xml"));
}

function detectMime(bytes: Uint8Array, fileName: string): string | null {
  if (isPdf(bytes)) return "application/pdf";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isPng(bytes)) return "image/png";
  if (isSvgText(bytes)) return "image/svg+xml";
  const ext = fileExtension(fileName);
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return null;
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "comprovante";
  const cleaned = base.replace(/[^\w.\-() áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]+/g, "_").trim();
  return cleaned.slice(0, 180) || "comprovante";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "not_authenticated", message: "Não autenticado." }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "invalid_session", message: "Sessão inválida." }, 401);
    }

    const form = await req.formData();
    const file = form.get("file");
    const agendamentoId = String(form.get("agendamento_id") ?? "").trim();

    if (!(file instanceof File)) {
      return jsonResponse({ error: "missing_file", message: "Nenhum arquivo enviado." }, 400);
    }

    if (!/^[0-9a-f-]{36}$/i.test(agendamentoId)) {
      return jsonResponse({ error: "invalid_agendamento", message: "Agendamento inválido." }, 400);
    }

    if (file.size <= 0) {
      return jsonResponse({ error: "empty_file", message: "O arquivo está vazio." }, 400);
    }

    if (file.size > MAX_BYTES) {
      return jsonResponse({
        error: "file_too_large",
        message: "Limite de 10MB por upload excedido.",
      }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedMime = detectMime(bytes, file.name);
    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) {
      return jsonResponse({
        error: "invalid_mime_type",
        message: "Formato não suportado. Envie PDF, SVG, JPG ou PNG.",
      }, 400);
    }

    const { data: agRow, error: agErr } = await userClient
      .from("agendamentos")
      .select("id, barbearia_id")
      .eq("id", agendamentoId)
      .maybeSingle();

    if (agErr || !agRow?.barbearia_id) {
      return jsonResponse({ error: "forbidden", message: "Sem permissão para este agendamento." }, 403);
    }

    const { data: canEdit } = await userClient.rpc("painel_pode_editar_pagamento_agendamento", {
      p_agendamento_id: agendamentoId,
    });
    if (!canEdit) {
      return jsonResponse({ error: "forbidden", message: "Sem permissão para anexar comprovante." }, 403);
    }

    const ext = EXT_BY_MIME[detectedMime] ?? fileExtension(file.name) || ".bin";
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${agRow.barbearia_id}/${agendamentoId}/${crypto.randomUUID()}${ext}`;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: detectedMime,
      upsert: false,
    });

    if (upErr) {
      return jsonResponse({ error: "upload_failed", message: upErr.message }, 500);
    }

    const { data: reg, error: regErr } = await userClient.rpc("register_agendamento_comprovante", {
      p_agendamento_id: agendamentoId,
      p_storage_path: storagePath,
      p_mime_type: detectedMime,
      p_file_name: safeName,
      p_size_bytes: file.size,
    });

    if (regErr || !reg || (reg as { error?: string }).error) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return jsonResponse({
        error: "register_failed",
        message: regErr?.message ?? (reg as { error?: string })?.error ?? "Falha ao registrar comprovante.",
      }, 500);
    }

    const previousPath = (reg as { previous_storage_path?: string | null }).previous_storage_path;
    if (previousPath && previousPath !== storagePath) {
      await admin.storage.from(BUCKET).remove([previousPath]);
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("upload-agendamento-comprovante:", e);
    return jsonResponse({ error: "internal", message: "Erro interno." }, 500);
  }
});
