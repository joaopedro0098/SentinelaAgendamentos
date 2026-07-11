import { supabase } from "@/integrations/supabase/client";

export const PACIENTE_DOCUMENTO_MAX_BYTES = 10 * 1024 * 1024;

export const PACIENTE_DOCUMENTO_ACCEPT =
  ".doc,.docx,.pdf,.jpg,.jpeg,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/jpeg";

const ALLOWED_EXTENSIONS = new Set([".doc", ".docx", ".pdf", ".jpg", ".jpeg"]);

const ALLOWED_MIME = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "image/jpeg",
]);

export type PacienteDocumentoItem = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
  can_delete: boolean;
};

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function validatePacienteDocumentoFile(
  file: File,
): { ok: true } | { ok: false; message: string } {
  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      message: "Formato não suportado. Envie Word (.doc, .docx), PDF (.pdf) ou imagem (.jpg, .jpeg).",
    };
  }

  if (file.size <= 0) {
    return { ok: false, message: "O arquivo está vazio." };
  }

  if (file.size > PACIENTE_DOCUMENTO_MAX_BYTES) {
    return { ok: false, message: "O arquivo excede o limite de 10 MB." };
  }

  if (file.type && !ALLOWED_MIME.has(file.type)) {
    const zipOk =
      (file.type === "application/zip" || file.type === "application/x-zip-compressed") &&
      ext === ".docx";
    if (!zipOk) {
      return {
        ok: false,
        message: "Formato não suportado. Envie Word (.doc, .docx), PDF (.pdf) ou imagem (.jpg, .jpeg).",
      };
    }
  }

  return { ok: true };
}

export function parsePacienteDocumentosRpc(data: unknown): PacienteDocumentoItem[] | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.error) return null;
  const raw = row.documentos;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: String(item.id),
      file_name: String(item.file_name ?? ""),
      mime_type: String(item.mime_type ?? ""),
      size_bytes: Number(item.size_bytes ?? 0),
      storage_path: String(item.storage_path ?? ""),
      created_at: String(item.created_at ?? ""),
      can_delete: item.can_delete === true,
    }));
}

export async function listPacienteDocumentos(whatsappDigits: string) {
  const { data, error } = await supabase.rpc("list_paciente_documentos", {
    p_whatsapp_digits: whatsappDigits,
  });
  if (error) return { error: error.message };
  const documentos = parsePacienteDocumentosRpc(data);
  if (documentos === null) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error?: string }).error)
        : "Resposta inválida";
    return { error: message };
  }
  return { documentos };
}

export async function uploadPacienteDocumento(whatsappDigits: string, file: File) {
  const validation = validatePacienteDocumentoFile(file);
  if (!validation.ok) return { error: validation.message };

  const form = new FormData();
  form.append("file", file);
  form.append("whatsapp_digits", whatsappDigits);

  const { data, error } = await supabase.functions.invoke("upload-paciente-documento", {
    body: form,
  });

  if (error) {
    let message = error.message || "Não foi possível enviar o documento.";
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      try {
        const body = (await ctx.json()) as { message?: string; error?: string };
        if (body?.message) message = body.message;
      } catch {
        // mantém mensagem padrão
      }
    }
    return { error: message };
  }

  const row = data as Record<string, unknown> | null;
  if (!row || row.error) {
    const message =
      row && typeof row.message === "string"
        ? row.message
        : "Não foi possível enviar o documento.";
    return { error: message };
  }

  return { ok: true as const, documento: row.documento as PacienteDocumentoItem | undefined };
}

export async function deletePacienteDocumento(documentoId: string) {
  const { data, error } = await supabase.rpc("delete_paciente_documento_painel", {
    p_documento_id: documentoId,
  });
  if (error) return { error: error.message };
  const row = data as { error?: string; ok?: boolean; storage_path?: string } | null;
  if (!row || row.error) return { error: row?.error ?? "Não foi possível excluir o documento." };

  if (row.storage_path) {
    await supabase.storage.from("paciente-documentos").remove([row.storage_path]);
  }

  return { ok: true as const };
}

export async function getPacienteDocumentoSignedUrl(storagePath: string, expiresInSeconds = 120) {
  const { data, error } = await supabase.storage
    .from("paciente-documentos")
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return { error: error?.message ?? "Não foi possível abrir o documento." };
  }
  return { signedUrl: data.signedUrl };
}

export function formatDocumentoSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocumentoDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
