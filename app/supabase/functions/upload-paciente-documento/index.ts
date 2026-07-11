import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "image/jpeg",
]);

const EXT_BY_MIME: Record<string, string> = {
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPdf(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isOleDoc(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1
  );
}

function isZip(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06))
  );
}

function isDocx(bytes: Uint8Array) {
  if (!isZip(bytes)) return false;
  const sample = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 8192)));
  return sample.includes("word/") || sample.includes("[Content_Types].xml");
}

function detectMimeFromBytes(bytes: Uint8Array): string | null {
  if (isPdf(bytes)) return "application/pdf";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isOleDoc(bytes)) return "application/msword";
  if (isDocx(bytes)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "documento";
  const cleaned = base.replace(/[^\w.\-() áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]+/g, "_").trim();
  return cleaned.slice(0, 255) || "documento";
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

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "invalid_session", message: "Sessão inválida." }, 401);
    }

    const userId = userData.user.id;
    const form = await req.formData();
    const file = form.get("file");
    const whatsappDigits = String(form.get("whatsapp_digits") ?? "").replace(/\D/g, "");

    if (!(file instanceof File)) {
      return jsonResponse({ error: "missing_file", message: "Nenhum arquivo enviado." }, 400);
    }

    if (whatsappDigits.length < 10) {
      return jsonResponse({ error: "invalid_whatsapp", message: "Paciente inválido." }, 400);
    }

    if (file.size <= 0) {
      return jsonResponse({ error: "empty_file", message: "O arquivo está vazio." }, 400);
    }

    if (file.size > MAX_BYTES) {
      return jsonResponse({
        error: "file_too_large",
        message: "O arquivo excede o limite de 10 MB.",
      }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedMime = detectMimeFromBytes(bytes);

    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) {
      return jsonResponse({
        error: "invalid_mime_type",
        message: "Formato não suportado. Envie Word (.doc, .docx), PDF (.pdf) ou imagem (.jpg, .jpeg).",
      }, 400);
    }

    const declaredMime = file.type.trim().toLowerCase();
    if (declaredMime && declaredMime !== detectedMime) {
      // Alguns navegadores reportam application/zip para .docx — aceitar se assinatura for docx.
      const zipDeclared = declaredMime === "application/zip" || declaredMime === "application/x-zip-compressed";
      if (!(zipDeclared && detectedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
        return jsonResponse({
          error: "mime_mismatch",
          message: "O conteúdo do arquivo não corresponde ao formato informado.",
        }, 400);
      }
    }

    const docId = crypto.randomUUID();
    const ext = EXT_BY_MIME[detectedMime];
    const storagePath = `${userId}/patients/${whatsappDigits}/${docId}${ext}`;
    const fileName = sanitizeFileName(file.name);

    const { error: uploadErr } = await userClient.storage
      .from("paciente-documentos")
      .upload(storagePath, bytes, {
        upsert: false,
        contentType: detectedMime,
        cacheControl: "3600",
      });

    if (uploadErr) {
      const message =
        uploadErr.message?.toLowerCase().includes("too large") ||
        uploadErr.message?.toLowerCase().includes("payload")
          ? "O arquivo excede o limite de 10 MB."
          : uploadErr.message?.toLowerCase().includes("mime")
            ? "Formato de arquivo não suportado."
            : "Não foi possível enviar o arquivo.";
      return jsonResponse({ error: "upload_failed", message }, 400);
    }

    const { data: registerData, error: registerErr } = await userClient.rpc(
      "register_paciente_documento_painel",
      {
        p_whatsapp_digits: whatsappDigits,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_mime_type: detectedMime,
        p_size_bytes: file.size,
      },
    );

    if (registerErr || !registerData || typeof registerData !== "object") {
      await userClient.storage.from("paciente-documentos").remove([storagePath]);
      return jsonResponse({
        error: "register_failed",
        message: registerErr?.message ?? "Não foi possível registrar o documento.",
      }, 400);
    }

    const row = registerData as Record<string, unknown>;
    if (row.error) {
      await userClient.storage.from("paciente-documentos").remove([storagePath]);
      const message =
        typeof row.message === "string"
          ? row.message
          : row.error === "file_too_large"
            ? "O arquivo excede o limite de 10 MB."
            : row.error === "invalid_mime_type"
              ? "Formato de arquivo não suportado."
              : "Não foi possível registrar o documento.";
      return jsonResponse({ error: String(row.error), message }, 400);
    }

    return jsonResponse({
      ok: true,
      documento: {
        id: row.id,
        file_name: row.file_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        storage_path: row.storage_path,
      },
    });
  } catch (err) {
    console.error("upload-paciente-documento", err);
    return jsonResponse({
      error: "internal_error",
      message: "Erro inesperado ao enviar o documento.",
    }, 500);
  }
});
