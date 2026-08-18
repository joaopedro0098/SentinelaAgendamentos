import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 10 * 1024 * 1024;
const SIZE_LIMIT_MESSAGE =
  "Limite de 10MB por upload excedido. Suba uma quantidade menor e depois suba o restante.";

const ALLOWED_MIME = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "application/rtf",
  "text/plain",
  "text/csv",
  "text/comma-separated-values",
  "application/csv",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

const EXT_BY_MIME: Record<string, string> = {
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/pdf": ".pdf",
  "application/rtf": ".rtf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/comma-separated-values": ".csv",
  "application/csv": ".csv",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

const EXTENSION_MIME: Record<string, string> = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".rtf": "application/rtf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/plain",
  ".log": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
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

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isGif(bytes: Uint8Array) {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  );
}

function isWebp(bytes: Uint8Array) {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isBmp(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
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

function detectMimeFromBytes(bytes: Uint8Array, fileName: string): string | null {
  if (isPdf(bytes)) return "application/pdf";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isPng(bytes)) return "image/png";
  if (isGif(bytes)) return "image/gif";
  if (isWebp(bytes)) return "image/webp";
  if (isBmp(bytes)) return "image/bmp";
  if (isOleDoc(bytes)) return "application/msword";
  if (isDocx(bytes)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const ext = fileExtension(fileName);
  return EXTENSION_MIME[ext] ?? null;
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
      return jsonResponse({ error: "file_too_large", message: SIZE_LIMIT_MESSAGE }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detectedMime = detectMimeFromBytes(bytes, file.name);

    if (!detectedMime || !ALLOWED_MIME.has(detectedMime)) {
      return jsonResponse({
        error: "invalid_mime_type",
        message: "Formato não suportado. Envie imagens, PDF, Word ou arquivos de texto (.txt, .csv).",
      }, 400);
    }

    const declaredMime = file.type.trim().toLowerCase();
    if (declaredMime && declaredMime !== detectedMime) {
      const zipDeclared = declaredMime === "application/zip" || declaredMime === "application/x-zip-compressed";
      const textFamily =
        (declaredMime.startsWith("text/") || declaredMime === "application/csv") &&
        (detectedMime.startsWith("text/") || detectedMime === "application/csv");
      if (!(zipDeclared && detectedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") && !textFamily) {
        return jsonResponse({
          error: "mime_mismatch",
          message: "O conteúdo do arquivo não corresponde ao formato informado.",
        }, 400);
      }
    }

    const docId = crypto.randomUUID();
    const ext = EXT_BY_MIME[detectedMime] ?? fileExtension(file.name) ?? "";
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
          ? SIZE_LIMIT_MESSAGE
          : uploadErr.message?.toLowerCase().includes("mime")
            ? "Formato de arquivo não suportado."
            : uploadErr.message?.toLowerCase().includes("forbidden")
              ? "Sem permissão para anexar documentos a este paciente."
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
          : row.error === "forbidden"
            ? "Sem permissão para anexar documentos a este paciente."
            : row.error === "invalid_mime_type"
              ? "Formato de arquivo não suportado."
              : row.error === "file_too_large"
                ? SIZE_LIMIT_MESSAGE
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
