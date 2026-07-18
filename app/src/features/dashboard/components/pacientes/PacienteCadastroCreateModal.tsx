import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { maskPhone, unmaskPhone, isValidPhone } from "@agenda/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  createPacienteCadastroPainel,
  type PacientePainelItem,
} from "@/features/dashboard/lib/agendamentoAnotacao";
import { extractWhatsappSearchDigits } from "@/features/dashboard/lib/pacienteFormat";

type Props = {
  open: boolean;
  initialWhatsappDigits: string;
  onClose: () => void;
  onCreated: (patient: PacientePainelItem) => void;
};

export function PacienteCadastroCreateModal({
  open,
  initialWhatsappDigits,
  onClose,
  onCreated,
}: Props) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome("");
    setDataNascimento("");
    const digits = extractWhatsappSearchDigits(initialWhatsappDigits);
    setWhatsapp(digits.length >= 10 ? maskPhone(digits.startsWith("55") ? digits.slice(2) : digits) : "");
  }, [open, initialWhatsappDigits]);

  const whatsappDigits = useMemo(() => unmaskPhone(whatsapp), [whatsapp]);

  async function handleSave() {
    const trimmedNome = nome.trim();
    if (!trimmedNome) {
      toast({ title: "Informe o nome do paciente", variant: "destructive" });
      return;
    }
    if (!isValidPhone(whatsapp)) {
      toast({ title: "WhatsApp inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const result = await createPacienteCadastroPainel(
      whatsappDigits,
      trimmedNome,
      dataNascimento.trim() || null,
    );
    setSaving(false);

    if ("error" in result) {
      toast({
        title: result.alreadyExists ? "Paciente já cadastrado" : "Não foi possível cadastrar",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Paciente cadastrado" });
    onCreated(result.patient);
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
        aria-labelledby="paciente-create-modal-title"
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl border border-border/80 bg-background p-5 shadow-xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="paciente-create-modal-title" className="text-lg font-semibold tracking-tight">
              Cadastrar paciente
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Preencha os dados cadastrais. O histórico aparecerá após atendimentos.
            </p>
          </div>
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paciente-create-nome">Nome</Label>
            <Input
              id="paciente-create-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              autoFocus
              disabled={saving}
              placeholder="Nome do paciente"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paciente-create-whatsapp">WhatsApp</Label>
            <Input
              id="paciente-create-whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(maskPhone(unmaskPhone(e.target.value)))}
              disabled={saving}
              inputMode="numeric"
              placeholder="(11) 99999-9999"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paciente-create-nascimento">Data de nascimento (opcional)</Label>
            <Input
              id="paciente-create-nascimento"
              type="date"
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
              disabled={saving}
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
