import { useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { maskPhone, unmaskPhone } from "@agenda/lib/phone";
import { AvatarCropDialog } from "@/features/dashboard/components/AvatarCropDialog";
import { CtAggregatedAccountsSection } from "@/features/dashboard/components/CtAggregatedAccountsSection";
import { StaffOperationsSection } from "@/features/dashboard/components/StaffOperationsSection";
import { DashboardThemeToggle } from "@/components/theme/DashboardThemeToggle";
import { BarberPushToggle, PermissionToggleRow } from "@/components/pwa/BarberPushToggle";
import { patchDashboardShopCache, useDashboardShop, type DashboardShop } from "@/providers/DashboardShopProvider";
import { useSubscription } from "@/hooks/useSubscription";

export default function Settings() {
  const { user } = useAuth();
  const { shop: contextShop, loading, refresh } = useDashboardShop();
  const { info: subscriptionInfo } = useSubscription();
  const isCA = subscriptionInfo?.account_type === "ca";
  const canManageAggregated = subscriptionInfo?.can_manage_aggregated_accounts ?? false;
  const [shop, setShop] = useState<DashboardShop | null>(contextShop);
  const [saving, setSaving] = useState(false);
  const [copiedBooking, setCopiedBooking] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  const [slotInterval, setSlotInterval] = useState("30");
  const [savingSlots, setSavingSlots] = useState(false);
  const [savingClientSelfService, setSavingClientSelfService] = useState(false);
  const [savingClientPublicBooking, setSavingClientPublicBooking] = useState(false);
  const [savingShowServicePrices, setSavingShowServicePrices] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Configurações — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!contextShop) return;
    setShop(contextShop);
    setSlotInterval(String(contextShop.slot_interval_minutes ?? 30));
    setContactPhone(contextShop.contact_phone ? maskPhone(contextShop.contact_phone) : "");
  }, [contextShop]);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!shop || !user) return;
    setSaving(true);

    let nextAvatarUrl = shop.avatar_url;

    if (pendingAvatarBlob) {
      const path = `${user.id}/avatar.jpg`;
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
    }

    const contactDigits = unmaskPhone(contactPhone);
    const nextContactPhone = contactDigits ? contactDigits : null;

    const { error } = await supabase
      .from("barbershops")
      .update({
        display_name: shop.display_name.trim().slice(0, 80),
        contact_phone: nextContactPhone,
        ...(pendingAvatarBlob ? { avatar_url: nextAvatarUrl } : {}),
      })
      .eq("id", shop.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    setShop({
      ...shop,
      display_name: shop.display_name.trim().slice(0, 80),
      avatar_url: nextAvatarUrl,
      contact_phone: nextContactPhone,
    });
    patchDashboardShopCache({
      display_name: shop.display_name.trim().slice(0, 80),
      avatar_url: nextAvatarUrl,
      contact_phone: nextContactPhone,
    });
    const profilePhoto = (pendingAvatarBlob ? nextAvatarUrl : shop.avatar_url) ?? "";
    void supabase
      .from("barbearias")
      .update({ nome: shop.display_name.trim().slice(0, 80), logo_url: profilePhoto })
      .eq("slug", shop.slug);
    void refresh({ force: true });
    setPendingAvatarBlob(null);
    setAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
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

  async function handleCropConfirm(blob: Blob) {
    stageAvatarBlob(blob);
  }

  async function handleSaveSlotSettings() {
    if (!shop) return;

    const interval = parseInt(slotInterval, 10);

    if (!Number.isFinite(interval) || interval < 5 || interval > 120) {
      toast({
        title: "Intervalo inválido",
        description: "Use um valor entre 5 e 120 minutos.",
        variant: "destructive",
      });
      return;
    }

    setSavingSlots(true);
    const { error } = await supabase
      .from("barbershops")
      .update({ slot_interval_minutes: interval })
      .eq("id", shop.id);
    setSavingSlots(false);

    if (error) {
      toast({ title: "Erro ao salvar grade", description: error.message, variant: "destructive" });
      return;
    }

    setShop({ ...shop, slot_interval_minutes: interval });
    setSlotInterval(String(interval));
    toast({ title: "Grade de horários salva" });
  }

  async function handleToggleShowServicePrices(enabled: boolean) {
    if (!shop) return;
    setSavingShowServicePrices(true);
    const { error } = await supabase.rpc("set_show_service_prices", {
      p_enabled: enabled,
    });
    setSavingShowServicePrices(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setShop({ ...shop, show_service_prices: enabled });
    patchDashboardShopCache({ show_service_prices: enabled });
    toast({ title: enabled ? "Preços visíveis na agenda" : "Preços ocultos na agenda" });
  }

  async function handleToggleClientPublicBooking(enabled: boolean) {
    if (!shop) return;
    setSavingClientPublicBooking(true);
    const { error } = await supabase.rpc("set_allow_client_public_booking", {
      p_enabled: enabled,
    });
    setSavingClientPublicBooking(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setShop({ ...shop, allow_client_public_booking: enabled });
    patchDashboardShopCache({ allow_client_public_booking: enabled });
    toast({ title: enabled ? "Cliente pode agendar pelo link" : "Agendamento pelo link desativado" });
  }

  async function handleToggleClientSelfService(enabled: boolean) {
    if (!shop) return;
    setSavingClientSelfService(true);
    const { error } = await supabase.rpc("set_allow_client_self_service", {
      p_enabled: enabled,
    });
    setSavingClientSelfService(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setShop({ ...shop, allow_client_self_service: enabled });
    patchDashboardShopCache({ allow_client_self_service: enabled });
    toast({ title: enabled ? "Cliente pode alterar/cancelar" : "Alteração pelo cliente desativada" });
  }

  function copyBookingLink(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedBooking(true);
    window.setTimeout(() => setCopiedBooking(false), 1800);
    toast({ title: "Link de agendamento copiado!", description: url });
  }

  function copyOwnerBookingLink() {
    if (!ownerBookingUrl) return;
    copyBookingLink(ownerBookingUrl);
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
  const displayedAvatarUrl = avatarPreviewUrl ?? shop.avatar_url;
  const ownerSlug = subscriptionInfo?.owner_slug;
  const ownerBookingUrl = ownerSlug ? `${window.location.origin}/agendar/${ownerSlug}` : null;
  const ownerPublicBookingEnabled = subscriptionInfo?.owner_public_booking_enabled ?? false;
  const profileDisplayName = isCA
    ? (subscriptionInfo?.owner_display_name ?? shop.display_name)
    : shop.display_name;
  const profileAvatarUrl = isCA
    ? (subscriptionInfo?.owner_avatar_url ?? shop.avatar_url)
    : (displayedAvatarUrl ?? shop.avatar_url);
  const profileContactPhone = isCA
    ? (subscriptionInfo?.owner_contact_phone ? maskPhone(subscriptionInfo.owner_contact_phone) : "")
    : contactPhone;
  const displayedAvatarUrlResolved = isCA ? profileAvatarUrl : displayedAvatarUrl ?? shop.avatar_url;

  return (
    <>
      <AvatarCropDialog
        open={cropOpen}
        file={cropFile}
        onClose={() => {
          setCropOpen(false);
          setCropFile(null);
        }}
        onConfirm={handleCropConfirm}
      />

      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 w-full overflow-x-hidden">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
            <p className="text-sm text-muted-foreground">
              Perfil da empresa, link de agendamento e equipe de atendimento.
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-2 shrink-0">
            <DashboardThemeToggle />
          </div>
        </header>

        <Card className="glass-panel border-border/80">
          <CardContent className="pt-6 space-y-5">
            <h2 className="text-base font-semibold tracking-tight">Permissões</h2>

            <BarberPushToggle />

            {isCA ? (
              <p className="text-sm text-muted-foreground">
                Link de agendamento controlado pelo titular — toggles desabilitados enquanto a conta estiver agregada.
              </p>
            ) : (
              <>
                <PermissionToggleRow
                  id="client-public-booking"
                  label="Cliente agenda pelo link"
                  checked={shop.allow_client_public_booking ?? true}
                  disabled={savingClientPublicBooking}
                  busy={savingClientPublicBooking}
                  onToggle={() => void handleToggleClientPublicBooking(!(shop.allow_client_public_booking ?? true))}
                />

                <PermissionToggleRow
                  id="client-self-service"
                  label="Cliente altera ou cancela pelo link"
                  checked={shop.allow_client_self_service ?? true}
                  disabled={savingClientSelfService || !(shop.allow_client_public_booking ?? true)}
                  busy={savingClientSelfService}
                  onToggle={() => void handleToggleClientSelfService(!(shop.allow_client_self_service ?? true))}
                />

                <PermissionToggleRow
                  id="show-service-prices"
                  label="Mostrar preço do serviço"
                  checked={shop.show_service_prices ?? false}
                  disabled={savingShowServicePrices}
                  busy={savingShowServicePrices}
                  onToggle={() => void handleToggleShowServicePrices(!(shop.show_service_prices ?? false))}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/80">
          <CardContent className="pt-6">
            <form onSubmit={isCA ? (e) => e.preventDefault() : handleSave} className="space-y-5">
              {isCA && (
                <p className="text-sm text-muted-foreground">
                  Nome, logo e contato exibidos ao cliente vêm do titular ({subscriptionInfo?.aggregated_by_email ?? "conta principal"}).
                  Seu link individual permanece desativado enquanto a agregação estiver ativa.
                </p>
              )}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {isCA ? (
                  <Avatar className="h-24 w-24 shrink-0">
                    {displayedAvatarUrlResolved && (
                      <AvatarImage src={displayedAvatarUrlResolved} alt={profileDisplayName} />
                    )}
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {(profileDisplayName.trim() || "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={saving}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full disabled:opacity-60"
                    aria-label="Alterar foto"
                  >
                    <Avatar className="h-24 w-24">
                      {displayedAvatarUrlResolved && (
                        <AvatarImage src={displayedAvatarUrlResolved} alt={shop.display_name} />
                      )}
                      <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                        {(shop.display_name.trim() || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute inset-x-0 bottom-0 flex justify-center bg-black/25 pb-[3px] pt-[2px]">
                      <Camera className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
                    </span>
                  </button>
                )}

                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="display-name">Nome do Perfil</Label>
                    <Input
                      id="display-name"
                      value={isCA ? profileDisplayName : shop.display_name}
                      onChange={(e) => setShop({ ...shop, display_name: e.target.value })}
                      maxLength={80}
                      placeholder="Defina o nome do perfil"
                      required={!isCA}
                      readOnly={isCA}
                      disabled={isCA}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-phone">Contato</Label>
                    <Input
                      id="contact-phone"
                      type="tel"
                      inputMode="numeric"
                      value={profileContactPhone}
                      onChange={(e) => setContactPhone(maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      readOnly={isCA}
                      disabled={isCA}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isCA ? "Contato do titular, usado para suporte ao cliente." : "Importante para prestarmos suporte."}
                    </p>
                  </div>
                  {!isCA && (
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
                  )}
                </div>
              </div>

              {!isCA && (
                <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              )}

              {isCA ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <Label htmlFor="owner-booking-link">Link de agendamento do titular</Label>
                  <p className="text-xs text-muted-foreground">
                    Seus clientes agendam pelo link abaixo. Seu link individual fica desativado enquanto a conta estiver agregada.
                  </p>
                  {ownerBookingUrl && ownerPublicBookingEnabled ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="owner-booking-link"
                        value={ownerBookingUrl}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button type="button" onClick={copyOwnerBookingLink} variant="secondary" className="shrink-0">
                        {copiedBooking ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copiedBooking ? "Copiado" : "Copiar link"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      O titular ainda não ativou o link público de agendamento.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <Label htmlFor="booking-link">Link para o cliente agendar</Label>
                  <p className="text-xs text-muted-foreground">Compartilhe este link com seu cliente</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input id="booking-link" value={bookingUrl} readOnly className="font-mono text-xs" />
                    <Button
                      type="button"
                      onClick={() => copyBookingLink(bookingUrl)}
                      variant="secondary"
                      className="shrink-0"
                    >
                      {copiedBooking ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiedBooking ? "Copiado" : "Copiar link"}
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <StaffOperationsSection barbershopId={shop.id} barbershopSlug={shop.slug} maxActiveStaff={isCA ? 1 : undefined} />

        {canManageAggregated && <CtAggregatedAccountsSection />}

        <Card className="glass-panel border-border/80">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="slot-interval">Intervalo de tempo na grade (em minutos)</Label>
              <Input
                id="slot-interval"
                type="number"
                min={5}
                max={120}
                step={5}
                value={slotInterval}
                onChange={(e) => setSlotInterval(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Button type="button" className="w-full sm:w-auto" disabled={savingSlots} onClick={handleSaveSlotSettings}>
              {savingSlots ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
