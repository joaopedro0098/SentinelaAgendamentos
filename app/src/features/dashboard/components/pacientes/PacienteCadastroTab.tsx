import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Link2, Loader2, X } from "lucide-react";
import { maskPhone, unmaskPhone, isValidPhone } from "@agenda/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AvatarCropDialog } from "@/features/dashboard/components/AvatarCropDialog";
import {
  deletePacienteCadastroPainel,
  getPatientActivationLink,
  updatePacienteAvatar,
  updatePacienteDataNascimento,
  updatePacienteNome,
  updatePacienteWhatsapp,
  type PacientePainelItem,
} from "@/features/dashboard/lib/agendamentoAnotacao";

type Props = {
  paciente: PacientePainelItem;
  canDeleteCadastro: boolean;
  onNomeSaved: (whatsapp: string, nome: string) => void;
  onWhatsappSaved: (previousWhatsapp: string, newWhatsapp: string) => void;
  onDataNascimentoSaved: (whatsapp: string, data: string | null) => void;
  onAvatarSaved: (whatsapp: string, avatarUrl: string | null) => void;
  onCadastroDeleted: (whatsapp: string) => void;
};

function whatsappToLocalInput(digits: string) {
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  return maskPhone(local);
}

function localInputToWhatsappDigits(localMasked: string) {
  const raw = unmaskPhone(localMasked);
  if (!raw) return "";
  return raw.startsWith("55") ? raw : `55${raw}`;
}

export function PacienteCadastroTab({
  paciente,
  canDeleteCadastro,
  onNomeSaved,
  onWhatsappSaved,
  onDataNascimentoSaved,
  onAvatarSaved,
  onCadastroDeleted,
}: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(paciente.cliente_nome);
  const [whatsappLocal, setWhatsappLocal] = useState(() => whatsappToLocalInput(paciente.whatsapp_digits));
  const [dataNascimento, setDataNascimento] = useState(paciente.data_nascimento ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharingLink, setSharingLink] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const canEdit = paciente.can_rename_nome === true;
  const hasFormalCadastro = Boolean(paciente.cliente_id);
  const contaAtivada = paciente.conta_ativada === true;
  const showShareActivation = hasFormalCadastro && !contaAtivada;
  const showActivationSection = showShareActivation || canDeleteCadastro;
  const displayedAvatarUrl = avatarPreviewUrl ?? paciente.avatar_url ?? null;

  useEffect(() => {
    setNome(paciente.cliente_nome);
    setWhatsappLocal(whatsappToLocalInput(paciente.whatsapp_digits));
    setDataNascimento(paciente.data_nascimento ?? "");
    setPendingAvatarBlob(null);
    setAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [paciente.whatsapp_digits, paciente.cliente_nome, paciente.data_nascimento, paciente.avatar_url]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const nomeChanged = nome.trim() !== paciente.cliente_nome.trim();
  const whatsappChanged =
    localInputToWhatsappDigits(whatsappLocal) !== paciente.whatsapp_digits;
  const dataChanged = (paciente.data_nascimento ?? "") !== dataNascimento.trim();
  const hasChanges = nomeChanged || whatsappChanged || dataChanged || Boolean(pendingAvatarBlob);

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
    if (!hasChanges) {
      toast({ title: "Nenhuma alteração para salvar" });
      return;
    }

    const trimmedNome = nome.trim();
    if (nomeChanged && !trimmedNome) {
      toast({ title: "Informe o nome do paciente", variant: "destructive" });
      return;
    }

    const dataValue = dataNascimento.trim() || null;
    if (dataChanged && dataValue && !/^\d{4}-\d{2}-\d{2}$/.test(dataValue)) {
      toast({ title: "Data inválida", description: "Use o formato correto.", variant: "destructive" });
      return;
    }

    const nextWhatsappDigits = localInputToWhatsappDigits(whatsappLocal);
    if (whatsappChanged && !isValidPhone(whatsappLocal)) {
      toast({
        title: "WhatsApp inválido",
        description: "Informe DDD + número com pelo menos 10 dígitos.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const currentWhatsapp = paciente.whatsapp_digits;

    if (nomeChanged && canEdit) {
      const nomeResult = await updatePacienteNome(currentWhatsapp, trimmedNome);
      if (nomeResult.error) {
        setSaving(false);
        toast({ title: "Erro ao salvar nome", description: nomeResult.error, variant: "destructive" });
        return;
      }
      onNomeSaved(currentWhatsapp, nomeResult.nome ?? trimmedNome);
    }

    if (pendingAvatarBlob && canEdit) {
      if (!user) {
        setSaving(false);
        toast({ title: "Sessão expirada", variant: "destructive" });
        return;
      }
      const path = `${user.id}/patients/${currentWhatsapp}.jpg`;
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
      const nextAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const avatarResult = await updatePacienteAvatar(currentWhatsapp, nextAvatarUrl);
      if (avatarResult.error) {
        setSaving(false);
        toast({ title: "Erro ao salvar foto", description: avatarResult.error, variant: "destructive" });
        return;
      }
      onAvatarSaved(currentWhatsapp, nextAvatarUrl);
      setPendingAvatarBlob(null);
      setAvatarPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    }

    if (dataChanged) {
      const result = await updatePacienteDataNascimento(currentWhatsapp, dataValue);
      if (result.error) {
        setSaving(false);
        toast({ title: "Erro ao salvar", description: result.error, variant: "destructive" });
        return;
      }
      onDataNascimentoSaved(currentWhatsapp, dataValue);
    }

    if (whatsappChanged && canEdit) {
      const whatsappResult = await updatePacienteWhatsapp(currentWhatsapp, nextWhatsappDigits);
      if (whatsappResult.error) {
        setSaving(false);
        toast({ title: "Erro ao salvar WhatsApp", description: whatsappResult.error, variant: "destructive" });
        return;
      }
      onWhatsappSaved(currentWhatsapp, whatsappResult.whatsapp_digits);
    }

    setSaving(false);
    toast({ title: "Dados salvos" });
  }

  async function handleShareActivationLink() {
    setSharingLink(true);
    const result = await getPatientActivationLink(paciente.whatsapp_digits);
    setSharingLink(false);
    if ("error" in result) {
      toast({ title: "Não foi possível gerar o link", description: result.error, variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast({ title: "Link copiado", description: "Cole e envie ao paciente como preferir." });
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: result.url,
        variant: "destructive",
      });
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    const result = await deletePacienteCadastroPainel(paciente.whatsapp_digits);
    setDeleting(false);
    if ("error" in result && result.error) {
      const message =
        result.error === "forbidden"
          ? "Somente o titular da clínica pode excluir cadastros."
          : result.error === "not_found"
            ? "Paciente não encontrado na sua conta."
            : result.error;
      toast({ title: "Não foi possível excluir", description: message, variant: "destructive" });
      return;
    }
    toast({ title: "Paciente excluído permanentemente" });
    setDeleteOpen(false);
    onCadastroDeleted(paciente.whatsapp_digits);
  }

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

      {deleteOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Fechar"
              className="absolute inset-0 bg-black/60"
              onClick={() => !deleting && setDeleteOpen(false)}
            />
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-cadastro-title"
              className="relative z-10 w-full max-w-sm rounded-xl border border-destructive/40 bg-background p-5 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <p
                  id="delete-cadastro-title"
                  className="text-sm font-bold uppercase tracking-wide text-red-600"
                >
                  Zona de perigo
                </p>
                <button
                  type="button"
                  aria-label="Fechar"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                Esta ação excluirá permanentemente{" "}
                <span className="font-semibold">{paciente.cliente_nome}</span> e todo o histórico
                associado (cadastro, agendamentos, anotações e documentos). Não será possível desfazer.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleting}
                  onClick={() => void handleConfirmDelete()}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir cadastro"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div className="max-w-md space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {canEdit ? (
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
              {canEdit
                ? "Toque na foto para escolher, ajustar e salvar abaixo."
                : "Somente leitura para pacientes de outras contas."}
            </p>
            {canEdit && (
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="paciente-nome">Nome</Label>
          <Input
            id="paciente-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            disabled={!canEdit || saving}
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="paciente-contato">Contato (WhatsApp)</Label>
          <Input
            id="paciente-contato"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={whatsappLocal}
            onChange={(e) => setWhatsappLocal(maskPhone(e.target.value))}
            disabled={!canEdit || saving}
            placeholder="(11) 99999-9999"
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="paciente-data-nascimento">Data de nascimento</Label>
          <Input
            id="paciente-data-nascimento"
            type="date"
            value={dataNascimento}
            onChange={(e) => setDataNascimento(e.target.value)}
            disabled={!canEdit || saving}
            className="rounded-xl"
          />
        </div>

        <Button
          type="button"
          disabled={saving || !canEdit}
          onClick={() => void handleSave()}
          className={cn(
            "rounded-full bg-emerald-600 text-white hover:bg-emerald-700",
            !hasChanges && "opacity-50 hover:bg-emerald-600",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
        </Button>

        {showActivationSection && (
          <div className="pt-4 border-t border-border/60 space-y-0">
            <div className="flex items-start justify-between gap-3">
              {showShareActivation ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full gap-2"
                    disabled={saving || deleting || sharingLink}
                    onClick={() => void handleShareActivationLink()}
                  >
                    {sharingLink ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" />
                        Compartilhar Link
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Compartilhe este link com seu paciente caso ele queira criar uma conta e visualizar e
                    gerenciar seus agendamentos.
                  </p>
                </div>
              ) : (
                <div className="flex-1 min-w-0" />
              )}
              {canDeleteCadastro && (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0 rounded-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={saving || deleting || sharingLink}
                  onClick={() => setDeleteOpen(true)}
                >
                  Excluir cadastro
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
