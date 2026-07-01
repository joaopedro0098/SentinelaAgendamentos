import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { AvatarCropDialog } from "@/features/dashboard/components/AvatarCropDialog";
import {
  updatePacienteAvatar,
  updatePacienteDataNascimento,
  type PacientePainelItem,
} from "@/features/dashboard/lib/agendamentoAnotacao";
import { formatWhatsAppDisplay } from "@/features/dashboard/lib/pacienteFormat";
import { PacienteNomeEditButton } from "@/features/dashboard/components/PacienteNomeEditModal";

type Props = {
  paciente: PacientePainelItem;
  onOpenNomeEdit: (p: Pick<PacientePainelItem, "whatsapp_digits" | "cliente_nome">) => void;
  onDataNascimentoSaved: (whatsapp: string, data: string | null) => void;
  onAvatarSaved: (whatsapp: string, avatarUrl: string | null) => void;
};

export function PacienteCadastroTab({
  paciente,
  onOpenNomeEdit,
  onDataNascimentoSaved,
  onAvatarSaved,
}: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dataNascimento, setDataNascimento] = useState(paciente.data_nascimento ?? "");
  const [saving, setSaving] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const canEditPhoto = paciente.can_rename_nome === true;
  const displayedAvatarUrl = avatarPreviewUrl ?? paciente.avatar_url ?? null;

  useEffect(() => {
    setDataNascimento(paciente.data_nascimento ?? "");
    setPendingAvatarBlob(null);
    setAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [paciente.whatsapp_digits, paciente.data_nascimento, paciente.avatar_url]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  function stageAvatarBlob(blob: Blob) {
    setPendingAvatarBlob(blob);
    setAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(blob);
    });
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Escolha uma imagem.", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máximo 8 MB", variant: "destructive" });
      return;
    }
    setCropFile(file);
    setCropOpen(true);
  }

  async function handleSave() {
    const dataValue = dataNascimento.trim() || null;
    const dataChanged = (paciente.data_nascimento ?? "") !== (dataValue ?? "");

    if (dataChanged && dataValue && !/^\d{4}-\d{2}-\d{2}$/.test(dataValue)) {
      toast({ title: "Data inválida", description: "Use o formato correto.", variant: "destructive" });
      return;
    }

    if (!dataChanged && !pendingAvatarBlob) return;

    setSaving(true);

    let nextAvatarUrl = paciente.avatar_url ?? null;

    if (pendingAvatarBlob && canEditPhoto) {
      if (!user) {
        setSaving(false);
        toast({ title: "Sessão expirada", variant: "destructive" });
        return;
      }
      const path = `${user.id}/patients/${paciente.whatsapp_digits}.jpg`;
      const { error: upErr } = await supabase.storage.from("barbershop-avatars").upload(path, pendingAvatarBlob, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: "3600",
      });
      if (upErr) {
        setSaving(false);
        toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" });
        return;
      }
      const { data: urlData } = supabase.storage.from("barbershop-avatars").getPublicUrl(path);
      nextAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const avatarResult = await updatePacienteAvatar(paciente.whatsapp_digits, nextAvatarUrl);
      if (avatarResult.error) {
        setSaving(false);
        toast({ title: "Erro ao salvar foto", description: avatarResult.error, variant: "destructive" });
        return;
      }
      onAvatarSaved(paciente.whatsapp_digits, nextAvatarUrl);
    }

    if (dataChanged) {
      const result = await updatePacienteDataNascimento(paciente.whatsapp_digits, dataValue);
      if (result.error) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: result.error, variant: "destructive" });
        return;
      }
      onDataNascimentoSaved(paciente.whatsapp_digits, dataValue);
    }

    setSaving(false);
    const hadPendingAvatar = Boolean(pendingAvatarBlob);
    setPendingAvatarBlob(null);
    setAvatarPreviewUrl((current) => {
      if (current && hadPendingAvatar) URL.revokeObjectURL(current);
      return null;
    });

    if (pendingAvatarBlob && dataChanged) {
      toast({ title: "Dados salvos" });
    } else if (pendingAvatarBlob) {
      toast({ title: "Foto salva" });
    } else {
      toast({ title: "Data de nascimento salva" });
    }
  }

  const dataChanged = (paciente.data_nascimento ?? "") !== dataNascimento.trim();
  const hasChanges = dataChanged || Boolean(pendingAvatarBlob);

  return (
    <>
      <AvatarCropDialog
        open={cropOpen}
        file={cropFile}
        onClose={() => {
          setCropOpen(false);
          setCropFile(null);
        }}
        onConfirm={async (blob) => {
          stageAvatarBlob(blob);
        }}
      />

      <div className="max-w-md space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {canEditPhoto ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full disabled:opacity-60"
              aria-label="Alterar foto do paciente"
            >
              <Avatar className="h-24 w-24">
                {displayedAvatarUrl && (
                  <AvatarImage src={displayedAvatarUrl} alt={paciente.cliente_nome} />
                )}
                <AvatarFallback className="bg-secondary/60 text-muted-foreground text-2xl">
                  {paciente.cliente_nome.trim().slice(0, 2).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-x-0 bottom-0 flex justify-center bg-black/10 pb-[3px] pt-[2px]">
                <Camera className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
              </span>
            </button>
          ) : (
            <Avatar className="h-24 w-24 shrink-0">
              {displayedAvatarUrl && (
                <AvatarImage src={displayedAvatarUrl} alt={paciente.cliente_nome} />
              )}
              <AvatarFallback className="bg-secondary/60 text-muted-foreground text-2xl">
                {paciente.cliente_nome.trim().slice(0, 2).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
          )}

          <div className="flex-1 space-y-1.5">
            <Label>Foto do paciente</Label>
            <p className="text-xs text-muted-foreground">
              {canEditPhoto
                ? "Toque na foto para escolher, ajustar e salvar abaixo."
                : "Somente leitura para pacientes de outras contas."}
            </p>
            {canEditPhoto && (
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Nome</Label>
          <div className="flex items-center gap-2">
            <p className="flex-1 rounded-xl border border-border/70 bg-card/40 px-3 py-2.5 text-sm font-medium">
              {paciente.cliente_nome}
            </p>
            {paciente.can_rename_nome === true && (
              <PacienteNomeEditButton onClick={() => onOpenNomeEdit(paciente)} />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>WhatsApp</Label>
          <p className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
            {formatWhatsAppDisplay(paciente.whatsapp_digits)}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paciente-data-nascimento">Data de nascimento</Label>
          <Input
            id="paciente-data-nascimento"
            type="date"
            value={dataNascimento}
            onChange={(e) => setDataNascimento(e.target.value)}
            disabled={saving}
            className="rounded-xl"
          />
        </div>

        {hasChanges && (
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-full"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        )}
      </div>
    </>
  );
}
