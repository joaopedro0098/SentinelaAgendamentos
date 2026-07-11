import { useCallback, useRef, useState } from "react";
import { Eye, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PacientePainelItem } from "@/features/dashboard/lib/agendamentoAnotacao";
import { PacienteDocumentoFileIcon } from "@/features/dashboard/components/pacientes/PacienteDocumentoFileIcon";
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
  const [deleteTarget, setDeleteTarget] = useState<PacienteDocumentoItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const canUpload = paciente.can_rename_nome === true;

  const processUpload = useCallback(
    async (file: File) => {
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
    },
    [onRefresh, paciente.whatsapp_digits],
  );

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void processUpload(file);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!canUpload || uploading) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!canUpload || uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void processUpload(file);
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

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deletePacienteDocumento(deleteTarget.id);
    setDeleting(false);
    if ("error" in result && result.error) {
      toast({ title: "Não foi possível excluir", description: result.error, variant: "destructive" });
      return;
    }
    setDeleteTarget(null);
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
    <div
      className={cn("space-y-4", canUpload && "min-h-[12rem]")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {canUpload ? (
        <div
          className={cn(
            "rounded-xl border border-dashed px-4 py-4 transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border/70 bg-card/20",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Arraste um arquivo aqui ou use Enviar — Word, PDF ou imagem (.jpg, .jpeg), máx. 10 MB
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
              onChange={handleFilePick}
            />
          </div>
        </div>
      ) : null}

      {documentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/30 px-6 py-12 text-center text-sm text-muted-foreground">
          {canUpload
            ? "Nenhum documento anexado. Arraste um arquivo para esta área ou clique em Enviar."
            : "Nenhum documento anexado a este paciente."}
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]">
          {documentos.map((doc) => {
            const busy = deleting || openingId === doc.id;
            return (
              <li
                key={doc.id}
                className="group relative flex flex-col items-center rounded-xl border border-border/70 bg-card/40 p-3 text-center transition-shadow hover:shadow-sm"
              >
                <PacienteDocumentoFileIcon mimeType={doc.mime_type} fileName={doc.file_name} />
                <p
                  className="mt-2 w-full truncate text-xs font-medium leading-snug"
                  title={doc.file_name}
                >
                  {doc.file_name}
                </p>
                <p className="mt-0.5 w-full truncate text-[10px] text-muted-foreground">
                  {formatDocumentoDate(doc.created_at)} · {formatDocumentoSize(doc.size_bytes)}
                </p>
                <div className="mt-2 flex items-center justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleOpen(doc)}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                      "hover:bg-secondary/70 hover:text-foreground disabled:opacity-50",
                    )}
                    aria-label="Visualizar documento"
                    title="Visualizar"
                  >
                    {openingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                  {doc.can_delete ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setDeleteTarget(doc)}
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                        "hover:bg-destructive/10 hover:text-destructive disabled:opacity-50",
                      )}
                      aria-label="Excluir documento"
                      title="Excluir"
                    >
                      {deleting && deleteTarget?.id === doc.id ? (
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <span className="font-medium text-foreground">{deleteTarget?.file_name}</span>? Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className={cn(
                "mt-0 rounded-full border-border !bg-secondary !text-muted-foreground shadow-none",
                "hover:!bg-unavailable hover:!text-unavailable-foreground hover:!border-unavailable",
              )}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className={cn(
                "rounded-full border border-border !bg-secondary !text-muted-foreground shadow-none",
                "hover:!bg-primary hover:!text-primary-foreground hover:!border-primary",
              )}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
