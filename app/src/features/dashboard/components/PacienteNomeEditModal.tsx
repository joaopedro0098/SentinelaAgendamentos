import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { updatePacienteNome } from "@/features/dashboard/lib/agendamentoAnotacao";

type ModalProps = {
  open: boolean;
  whatsappDigits: string | null;
  initialNome: string;
  onClose: () => void;
  onSaved?: () => void;
};

export function PacienteNomeEditModal({
  open,
  whatsappDigits,
  initialNome,
  onClose,
  onSaved,
}: ModalProps) {
  const [nome, setNome] = useState(initialNome);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNome(initialNome);
  }, [open, initialNome]);

  async function handleSave() {
    if (!whatsappDigits) return;
    const trimmed = nome.trim();
    if (!trimmed) {
      toast({ title: "Informe um nome", variant: "destructive" });
      return;
    }
    setSaving(true);
    const result = await updatePacienteNome(whatsappDigits, trimmed);
    setSaving(false);
    if (result.error) {
      toast({ title: "Erro ao salvar", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Nome atualizado" });
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
        aria-labelledby="paciente-nome-modal-title"
        className={cn(
          "relative z-10 w-full max-w-sm rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 id="paciente-nome-modal-title" className="text-lg font-semibold tracking-tight">
            Nome do paciente
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            disabled={saving}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Este nome será usado em novos agendamentos com o mesmo WhatsApp.
        </p>
        <div className="space-y-2">
          <Label htmlFor="paciente-nome-input">Nome</Label>
          <Input
            id="paciente-nome-input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            autoFocus
            disabled={saving}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type ButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  className?: string;
};

export function PacienteNomeEditButton({ onClick, className }: ButtonProps) {
  return (
    <button
      type="button"
      aria-label="Editar nome do paciente"
      onClick={onClick}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground",
        "hover:bg-secondary/70 hover:text-foreground transition-colors",
        className,
      )}
    >
      <Pencil className="h-3 w-3" />
    </button>
  );
}
