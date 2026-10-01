import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  COMPROVANTE_ACCEPT,
  MAX_COMPROVANTES_POR_AGENDAMENTO,
  createAgendamentoComprovanteSignedUrl,
  fetchAgendamentoComprovanteById,
  fetchAgendamentoPanelPaymentInfo,
  listAgendamentoComprovantesMeta,
  panelAutomaticPaymentAmountLabel,
  panelFormaPagamentoLabel,
  uploadAgendamentoComprovante,
  type AgendamentoComprovanteListItem,
  type AgendamentoPanelPaymentInfo,
} from "@/features/dashboard/lib/agendamentoPanelPayment";

type Props = {
  agendamentoId: string;
  allowUpload?: boolean;
};

export function AgendamentoPainelPagamentoDetail({ agendamentoId, allowUpload = true }: Props) {
  const [paymentInfo, setPaymentInfo] = useState<AgendamentoPanelPaymentInfo | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [comprovantes, setComprovantes] = useState<AgendamentoComprovanteListItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [, setPreviewMime] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const comprovantesListedRef = useRef(false);
  const comprovantesRef = useRef<AgendamentoComprovanteListItem[]>([]);

  useEffect(() => {
    comprovantesRef.current = comprovantes;
  }, [comprovantes]);

  const ensureComprovanteList = useCallback(async (): Promise<AgendamentoComprovanteListItem[]> => {
    if (comprovantesListedRef.current) {
      return comprovantesRef.current;
    }
    comprovantesListedRef.current = true;
    const { items, error } = await listAgendamentoComprovantesMeta(agendamentoId);
    if (error) return comprovantesRef.current;
    setComprovantes(items);
    comprovantesRef.current = items;
    return items;
  }, [agendamentoId]);

  useEffect(() => {
    setPaymentInfo(null);
    setComprovantes([]);
    comprovantesRef.current = [];
    comprovantesListedRef.current = false;
    setPreviewUrl(null);
    setPreviewMime(null);
    setPaymentLoading(true);
    let cancelled = false;
    void (async () => {
      const [info, listResult] = await Promise.all([
        fetchAgendamentoPanelPaymentInfo(agendamentoId),
        listAgendamentoComprovantesMeta(agendamentoId),
      ]);
      if (cancelled) return;
      setPaymentLoading(false);
      if (info.error) {
        toast({ title: "Não foi possível carregar pagamento", description: info.error, variant: "destructive" });
        return;
      }
      setPaymentInfo(info);
      if (!listResult.error && listResult.items.length > 0) {
        comprovantesListedRef.current = true;
        comprovantesRef.current = listResult.items;
        setComprovantes(listResult.items);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agendamentoId]);

  const slotsLeft = MAX_COMPROVANTES_POR_AGENDAMENTO - comprovantes.length;

  const handlePickFiles = () => {
    if (!allowUpload) return;
    void (async () => {
      const list = await ensureComprovanteList();
      if (list.length >= MAX_COMPROVANTES_POR_AGENDAMENTO) {
        toast({ title: "Limite atingido", description: "Máximo de 2 comprovantes por agendamento." });
        return;
      }
      fileInputRef.current?.click();
    })();
  };

  const handleEyeClick = (comprovanteId: string) => {
    void handleViewComprovante(comprovanteId);
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const batch = files.slice(0, slotsLeft);
    setUploading(true);
    const added: AgendamentoComprovanteListItem[] = [];
    for (const file of batch) {
      const result = await uploadAgendamentoComprovante(agendamentoId, file);
      if ("error" in result) {
        toast({ title: "Upload não concluído", description: result.error, variant: "destructive" });
        break;
      }
      if (!result.id) continue;
      added.push({
        id: result.id,
        mime_type: file.type,
        file_name: file.name,
      });
    }
    setUploading(false);
    if (added.length) {
      setComprovantes((prev) => {
        const next = [...prev, ...added].slice(0, MAX_COMPROVANTES_POR_AGENDAMENTO);
        comprovantesRef.current = next;
        comprovantesListedRef.current = true;
        return next;
      });
      toast({
        title: added.length > 1 ? "Comprovantes enviados" : "Comprovante enviado",
      });
    }
  };

  const closePreview = useCallback(() => {
    setPreviewUrl(null);
    setPreviewMime(null);
    setViewingId(null);
  }, []);

  const handleViewComprovante = async (comprovanteId: string) => {
    setViewingId(comprovanteId);
    setPreviewLoading(true);
    setPreviewUrl(null);
    const meta = await fetchAgendamentoComprovanteById(comprovanteId);
    if (meta.error || !meta.storage_path) {
      setPreviewLoading(false);
      setViewingId(null);
      toast({ title: "Não foi possível abrir", description: meta.error ?? "Arquivo não encontrado.", variant: "destructive" });
      return;
    }
    const signed = await createAgendamentoComprovanteSignedUrl(meta.storage_path);
    setPreviewLoading(false);
    if ("error" in signed) {
      setViewingId(null);
      toast({ title: "Não foi possível abrir", description: signed.error, variant: "destructive" });
      return;
    }
    const mime = meta.mime_type ?? "";
    if (mime.startsWith("image/") || mime === "image/svg+xml") {
      setPreviewMime(mime);
      setPreviewUrl(signed.url);
      return;
    }
    window.open(signed.url, "_blank", "noopener,noreferrer");
    setViewingId(null);
  };

  const formaLabel = panelFormaPagamentoLabel(paymentInfo);
  const paidAmountLabel = panelAutomaticPaymentAmountLabel(paymentInfo);

  return (
    <>
      <div className="flex min-h-[8rem] flex-col">
        <div className="flex flex-1 items-center justify-center px-2 py-6 text-center">
          {paymentLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="space-y-1 text-sm text-foreground">
              <p>
                <span className="text-muted-foreground">Forma de pagamento: </span>
                <span className="font-medium">{formaLabel}</span>
              </p>
              {paidAmountLabel && (
                <p>
                  <span className="text-muted-foreground">Valor pago: </span>
                  <span className="font-medium tabular-nums">{paidAmountLabel}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {allowUpload && (
          <div className="mt-auto flex items-center justify-end gap-2 pt-4 border-t border-border/60">
            {comprovantes.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label="Ver comprovante"
                disabled={previewLoading && viewingId === c.id}
                onClick={() => handleEyeClick(c.id)}
                className={cn(
                  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  "bg-secondary/80 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors",
                  "disabled:opacity-40",
                )}
              >
                {previewLoading && viewingId === c.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            ))}
            <input
              ref={fileInputRef}
              type="file"
              accept={COMPROVANTE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => void handleFilesSelected(e)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={uploading || slotsLeft <= 0}
              onClick={handlePickFiles}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comprovante"}
            </Button>
          </div>
        )}
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70" onClick={closePreview}>
          <button
            type="button"
            aria-label="Fechar visualização"
            className="absolute top-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-background/90 text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              closePreview();
            }}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={previewUrl}
            alt="Comprovante"
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
