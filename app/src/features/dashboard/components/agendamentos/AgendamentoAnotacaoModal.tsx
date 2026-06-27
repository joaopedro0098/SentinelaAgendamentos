import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  fetchAgendamentoAnotacao,
  saveAgendamentoAnotacao,
} from "@/features/dashboard/lib/agendamentoAnotacao";

type Props = {
  open: boolean;
  agendamentoId: string | null;
  clienteNome?: string;
  onClose: () => void;
  onSaved?: () => void;
};

export function AgendamentoAnotacaoModal({
  open,
  agendamentoId,
  clienteNome,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conteudo, setConteudo] = useState("");
  const [canWrite, setCanWrite] = useState(false);

  useEffect(() => {
    if (!open || !agendamentoId) return;
    let cancelled = false;
    setLoading(true);
    void fetchAgendamentoAnotacao(agendamentoId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error && result.error !== "forbidden") {
        toast({ title: "Erro ao carregar anotação", variant: "destructive" });
        return;
      }
      setConteudo(result.conteudo ?? "");
      setCanWrite(result.can_write);
    });
    return () => {
      cancelled = true;
    };
  }, [open, agendamentoId]);

  useEffect(() => {
    if (!open) {
      setConteudo("");
      setCanWrite(false);
    }
  }, [open]);

  async function handleSave() {
    if (!agendamentoId || !canWrite) return;
    setSaving(true);
    const result = await saveAgendamentoAnotacao(agendamentoId, conteudo);
    setSaving(false);
    if (result.error) {
      toast({ title: "Erro ao salvar", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Anotação salva" });
    onSaved?.();
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/60"
        onClick={() => !saving && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="anotacao-modal-title"
        className={cn(
          "relative z-10 w-full max-w-lg rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 id="anotacao-modal-title" className="text-lg font-semibold tracking-tight">
              Anotação
            </h2>
            {clienteNome ? (
              <p className="text-sm text-muted-foreground truncate">{clienteNome}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={saving}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <textarea
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              readOnly={!canWrite}
              placeholder={canWrite ? "Registre observações sobre o atendimento…" : "Sem anotação registrada."}
              rows={8}
              className={cn(
                "flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm",
                "ring-offset-background placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50 min-h-[10rem]",
              )}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                {canWrite ? "Cancelar" : "Fechar"}
              </Button>
              {canWrite ? (
                <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

type ButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function AgendamentoAnotacaoButton({ onClick, disabled, className }: ButtonProps) {
  return (
    <button
      type="button"
      aria-label="Anotação do atendimento"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        "hover:bg-secondary/70 hover:text-foreground disabled:opacity-50",
        className,
      )}
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
}
