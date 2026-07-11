import { useRef, useState } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PacientePainelItem } from "@/features/dashboard/lib/agendamentoAnotacao";
import {
  deletePacienteDocumento,
  formatDocumentoDate,
  formatDocumentoSize,
  getPacienteDocumentoSignedUrl,
  PACIENTE_DOCUMENTO_ACCEPT,
  type PacienteDocumentoItem,
  uploadPacienteDocumento,
  validatePacienteDocumentoFile,
} from "@/features/dashboard/lib/pacienteDocumentos";

type Props = {
  paciente: PacientePainelItem;
  documentos: PacienteDocumentoItem[];
  loading: boolean;
  onRefresh: () => void;
};

export function PacienteDocumentosTab({ paciente, documentos, loading, onRefresh }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const canUpload = paciente.can_rename_nome === true;

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validation = validatePacienteDocumentoFile(file);
    if (!validation.ok) {
      toast({ title: "Arquivo inválido", description: validation.message, variant: "destructive" });
      return;
    }

    setUploading(true);
    const result = await uploadPacienteDocumento(paciente.whatsapp_digits, file);
    setUploading(false);

    if ("error" in result && result.error) {
      toast({
        title: "Não foi possível enviar",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Documento enviado" });
    onRefresh();
  }

  async function handleOpen(doc: PacienteDocumentoItem) {
    setOpeningId(doc.id);
    const result = await getPacienteDocumentoSignedUrl(doc.storage_path);
    setOpeningId(null);
    if ("error" in result && result.error) {
      toast({ title: "Não foi possível abrir", description: result.error, variant: "destructive" });
      return;
    }
    window.open(result.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(doc: PacienteDocumentoItem) {
    if (!doc.can_delete) return;
    setDeletingId(doc.id);
    const result = await deletePacienteDocumento(doc.id);
    setDeletingId(null);
    if ("error" in result && result.error) {
      toast({ title: "Não foi possível excluir", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Documento excluído" });
    onRefresh();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canUpload ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Word (.doc, .docx), PDF (.pdf) ou imagem (.jpg, .jpeg) — máx. 10 MB
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-full"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Enviar
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={PACIENTE_DOCUMENTO_ACCEPT}
            className="hidden"
            onChange={(e) => void handleFilePick(e)}
          />
        </div>
      ) : null}

      {documentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/30 px-6 py-12 text-center text-sm text-muted-foreground">
          Nenhum documento anexado a este paciente.
        </div>
      ) : (
        <ul className="space-y-2">
          {documentos.map((doc) => {
            const busy = deletingId === doc.id || openingId === doc.id;
            return (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-3 py-2.5"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={doc.file_name}>
                    {doc.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDocumentoDate(doc.created_at)} · {formatDocumentoSize(doc.size_bytes)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOpen(doc)}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                      "hover:bg-secondary/70 hover:text-foreground disabled:opacity-50",
                    )}
                    aria-label="Abrir documento"
                  >
                    {openingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                  {doc.can_delete ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(doc)}
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                        "hover:bg-destructive/10 hover:text-destructive disabled:opacity-50",
                      )}
                      aria-label="Excluir documento"
                    >
                      {deletingId === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
