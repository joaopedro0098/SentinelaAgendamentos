import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { maskPhone, unmaskPhone } from "@agenda/lib/phone";
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

const COUNTRY_CODES = [
  { code: "+55", country: "Brasil", flag: "🇧🇷" },
  { code: "+51", country: "Perú", flag: "🇵🇪" },
  { code: "+54", country: "Argentina", flag: "🇦🇷" },
  { code: "+56", country: "Chile", flag: "🇨🇱" },
  { code: "+57", country: "Colombia", flag: "🇨🇴" },
  { code: "+598", country: "Uruguay", flag: "🇺🇾" },
  { code: "+595", country: "Paraguay", flag: "🇵🇾" },
  { code: "+1", country: "EUA / Canada", flag: "🇺🇸" },
  { code: "+351", country: "Portugal", flag: "🇵🇹" },
  { code: "+34", country: "Espanha", flag: "🇪🇸" },
];

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
  const [countryCode, setCountryCode] = useState("+55");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome("");
    setCountryCode("+55");
    const digits = extractWhatsappSearchDigits(initialWhatsappDigits);
    setWhatsappNumber(digits.length >= 10 ? maskPhone(digits.startsWith("55") ? digits.slice(2) : digits) : "");
  }, [open, initialWhatsappDigits]);

  const rawPhoneDigits = useMemo(() => unmaskPhone(whatsappNumber), [whatsappNumber]);
  const isFormValid = useMemo(() => {
    return nome.trim().length > 0 && rawPhoneDigits.length >= 8;
  }, [nome, rawPhoneDigits]);

  async function handleSave() {
    const trimmedNome = nome.trim();
    if (!trimmedNome) {
      toast({ title: "Informe o nome completo", variant: "destructive" });
      return;
    }

    const cleanCountry = countryCode.replace(/\D/g, "");
    const fullPhoneDigits = countryCode === "+55"
      ? (rawPhoneDigits.startsWith("55") ? rawPhoneDigits : `55${rawPhoneDigits}`)
      : `${cleanCountry}${rawPhoneDigits}`;

    setSaving(true);
    const result = await createPacienteCadastroPainel(
      fullPhoneDigits,
      trimmedNome,
      null,
    );

    if ("error" in result) {
      setSaving(false);
      toast({
        title: result.alreadyExists ? "Paciente já cadastrado" : "Não foi possível cadastrar",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setSaving(false);
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
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={() => !saving && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paciente-create-modal-title"
        className={cn(
          "relative z-10 w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-150",
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="paciente-create-modal-title" className="text-xl font-bold tracking-tight font-display">
              Criar paciente
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre o nome e o número com WhatsApp. O link de ativação pode ser compartilhado depois na ficha do paciente.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            disabled={saving}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paciente-create-nome" className="text-sm font-medium">
              Nome completo
            </Label>
            <Input
              id="paciente-create-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              autoFocus
              disabled={saving}
              placeholder="Ex: João da Silva"
              className="rounded-xl h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paciente-create-whatsapp" className="text-sm font-medium">
              Contato (WhatsApp)
            </Label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                disabled={saving}
                className={cn(
                  "flex h-11 items-center justify-between rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium shadow-xs",
                  "focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code}
                  </option>
                ))}
              </select>
              <Input
                id="paciente-create-whatsapp"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(maskPhone(unmaskPhone(e.target.value)))}
                disabled={saving}
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                className="rounded-xl h-11 flex-1"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-full px-5" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full px-6 font-semibold"
            disabled={saving || !isFormValid}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
