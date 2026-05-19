import { useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, ExternalLink, Loader2, User } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { AvatarCropDialog } from "@/features/dashboard/components/AvatarCropDialog";
import { StaffOperationsSection } from "@/features/dashboard/components/StaffOperationsSection";
import { DashboardThemeToggle } from "@/components/theme/DashboardThemeToggle";

type Shop = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

export default function Settings() {
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedBooking, setCopiedBooking] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Configurações — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("barbershops").select("*").eq("owner_id", user.id).maybeSingle();
      setShop(data as Shop | null);
      setLoading(false);
    })();
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    const { error } = await supabase
      .from("barbershops")
      .update({
        display_name: shop.display_name.trim().slice(0, 80),
      })
      .eq("id", shop.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Salvo!" });
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

  async function uploadAvatarBlob(blob: Blob) {
    if (!shop || !user) return;
    setUploading(true);
    const path = `${user.id}/avatar.webp`;
    const { error: upErr } = await supabase.storage.from("barbershop-avatars").upload(path, blob, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "3600",
    });
    if (upErr) {
      setUploading(false);
      toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: urlData } = supabase.storage.from("barbershop-avatars").getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: updErr } = await supabase.from("barbershops").update({ avatar_url: publicUrl }).eq("id", shop.id);
    setUploading(false);
    if (updErr) {
      toast({ title: "Erro ao salvar foto", description: updErr.message, variant: "destructive" });
      return;
    }
    setShop({ ...shop, avatar_url: publicUrl });
    toast({ title: "Foto atualizada!" });
  }

  function copyBookingLink() {
    if (!shop) return;
    const url = `${window.location.origin}/agendar/${shop.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedBooking(true);
    window.setTimeout(() => setCopiedBooking(false), 1800);
    toast({ title: "Link de agendamento copiado!", description: url });
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }
  if (!shop) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Nenhuma empresa vinculada. Faça logout e cadastre-se novamente.
      </div>
    );
  }

  const bookingUrl = `${window.location.origin}/agendar/${shop.slug}`;

  return (
    <>
      <AvatarCropDialog
        open={cropOpen}
        file={cropFile}
        onClose={() => {
          setCropOpen(false);
          setCropFile(null);
        }}
        onConfirm={uploadAvatarBlob}
      />

      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 w-full overflow-x-hidden">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
            <p className="text-sm text-muted-foreground">
              Perfil da empresa, link de agendamento e equipe de atendimento.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/app/perfil">
                <User className="h-4 w-4" /> Perfil
              </Link>
            </Button>
            <DashboardThemeToggle />
          </div>
        </header>

        <Card className="glass-panel border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Perfil</CardTitle>
            <CardDescription>Altere a foto, o nome exibido e copie o link de agendamento para clientes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar className="h-24 w-24 shrink-0">
                  {shop.avatar_url && <AvatarImage src={shop.avatar_url} alt={shop.display_name} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {shop.display_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="display-name">Nome que aparece ao lado da foto</Label>
                    <Input
                      id="display-name"
                      value={shop.display_name}
                      onChange={(e) => setShop({ ...shop, display_name: e.target.value })}
                      maxLength={80}
                      required
                    />
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {uploading ? "Enviando foto…" : "Alterar foto"}
                  </Button>
                </div>
              </div>


              <div className="space-y-2 rounded-md border border-border p-3">
                <Label htmlFor="booking-link">Link para o cliente agendar</Label>
                <p className="text-xs text-muted-foreground">
                  Compartilhe para o cliente escolher serviço, horário e confirmar o agendamento.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="booking-link" value={bookingUrl} readOnly className="font-mono text-xs" />
                  <Button type="button" onClick={copyBookingLink} variant="secondary" className="shrink-0">
                    {copiedBooking ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiedBooking ? "Copiado" : "Copiar link"}
                  </Button>
                </div>
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Abrir agendamento <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                {saving ? "Salvando nome…" : "Salvar nome"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <StaffOperationsSection barbershopId={shop.id} />
      </div>
    </>
  );
}
