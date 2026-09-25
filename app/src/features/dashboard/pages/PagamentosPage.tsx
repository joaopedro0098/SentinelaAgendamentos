import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Info, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { supabase } from "@/integrations/supabase/client";
import { broadcastPaymentsConfigChanged } from "@agenda/lib/paymentsConfigSync";
import { usePaymentsConfigBroadcast } from "@/features/dashboard/hooks/usePaymentsConfigBroadcast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PermissionToggleRow } from "@/components/pwa/PermissionToggleRow";
import { toast } from "@/hooks/use-toast";
import { notifyPaymentExceptionsChanged } from "@/features/dashboard/hooks/usePendingPaymentExceptions";
import { buildSlotTakenLatePaymentMessage } from "@/lib/mpPaymentExceptionMessages";
import {
  disconnectMpAccount,
  fetchPaymentPanelSettings,
  savePaymentPanelSettings,
  saveShopManualPixKey,
  startMpOAuth,
  type PaymentPanelSettings,
} from "@/lib/paymentsApi";

const MP_STATUS_LABEL: Record<string, string> = {
  not_connected: "Não conectado",
  connected: "Conectado",
  token_expired: "Token expirado — reconecte",
};

type MpPaymentException = {
  id: string;
  agendamento_id: string | null;
  mp_payment_id: string;
  amount_centavos: number;
  reason: string;
  agendamento_data: string | null;
  agendamento_hora: string | null;
  cliente_nome: string | null;
  cliente_whatsapp?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

function formatMoney(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBr(isoDate: string | null) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function formatSlotLabel(data: string | null, hora: string | null) {
  const date = formatDateBr(data);
  if (!date) return "horário não informado";
  return hora ? `${date} às ${hora}` : date;
}

function buildExceptionDescription(ex: MpPaymentException) {
  const nome = ex.cliente_nome?.trim() || "Cliente";

  if (ex.reason === "slot_taken_late_payment") {
    return buildSlotTakenLatePaymentMessage(nome, ex.agendamento_data, ex.agendamento_hora);
  }

  if (ex.reason === "late_pix_after_hold_expired") {
    const slot = formatSlotLabel(ex.agendamento_data, ex.agendamento_hora);
    const valor = formatMoney(ex.amount_centavos);
    return `PIX tardio: O paciente ${nome} fez um agendamento para ${slot} mas o Pix foi confirmado após a expiração da reserva de 15 minutos (valor ${valor}). Verifique o pagamento e entre em contato com ${nome} se necessário.`;
  }

  return `Pagamento de ${nome} requer resolução manual (${ex.reason}).`;
}

export default function PagamentosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { info: subscriptionInfo, loading: subscriptionLoading } = useSubscription();
  const { shop } = useDashboardShop();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [settings, setSettings] = useState<PaymentPanelSettings | null>(null);

  const [centralized, setCentralized] = useState(true);
  const [passFeeCard, setPassFeeCard] = useState(false);
  const [passFeePix, setPassFeePix] = useState(false);
  const [manualPixKey, setManualPixKey] = useState("");
  const [savingManualPix, setSavingManualPix] = useState(false);
  const [exceptions, setExceptions] = useState<MpPaymentException[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);

  const applySettingsToForm = useCallback((data: PaymentPanelSettings) => {
    if (data.payments_centralized != null) setCentralized(data.payments_centralized);
    if (data.payment_pass_fee_card != null) setPassFeeCard(data.payment_pass_fee_card);
    if (data.payment_pass_fee_pix != null) setPassFeePix(data.payment_pass_fee_pix);
    if (data.manual_pix_key != null) setManualPixKey(data.manual_pix_key);
    else setManualPixKey("");
  }, []);

  const loadExceptions = useCallback(async () => {
    setLoadingExceptions(true);
    try {
      const { data, error } = await supabase.rpc("list_mp_payment_exceptions", { p_limit: 20 });
      if (error) throw error;
      const row = data as { error?: string; items?: MpPaymentException[] } | null;
      if (row?.error) throw new Error(row.error);
      setExceptions(Array.isArray(row?.items) ? row.items : []);
    } catch (e) {
      console.error("list_mp_payment_exceptions:", e);
      setExceptions([]);
    } finally {
      setLoadingExceptions(false);
    }
  }, []);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const data = await fetchPaymentPanelSettings();
      if (data.error && data.error !== "no_shop") {
        throw new Error(data.error);
      }
      setSettings(data);
      if (!data.ca_readonly) applySettingsToForm(data);
    } catch (e) {
      if (!options?.silent) {
        toast({
          title: "Erro ao carregar pagamentos",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [applySettingsToForm]);

  const notifyCasPaymentsConfigChanged = useCallback(() => {
    const slug = shop?.slug?.trim();
    if (!slug || !settings?.can_edit_centralization) return;
    void broadcastPaymentsConfigChanged(slug);
  }, [shop?.slug, settings?.can_edit_centralization]);

  usePaymentsConfigBroadcast(() => {
    void load({ silent: true });
  });

  useEffect(() => {
    document.title = "Pagamentos — Sentinela Agendamentos";
    void load();
    void loadExceptions();
  }, [load, loadExceptions]);

  useEffect(() => {
    const mp = searchParams.get("mp");
    if (!mp) return;

    if (mp === "connected") {
      toast({ title: "Mercado Pago conectado", description: "Sua conta foi vinculada com sucesso." });
    } else if (mp === "error") {
      toast({
        title: "Não foi possível conectar",
        description: "Autorização cancelada ou falhou. Tente novamente.",
        variant: "destructive",
      });
    }

    searchParams.delete("mp");
    searchParams.delete("reason");
    setSearchParams(searchParams, { replace: true });
    void load();
  }, [searchParams, setSearchParams, load]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await startMpOAuth();
      window.location.href = url;
    } catch (e) {
      toast({
        title: "Erro ao conectar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    try {
      const updated = await disconnectMpAccount();
      setSettings(updated);
      applySettingsToForm(updated);
      toast({ title: "Conta desconectada" });
    } catch (e) {
      toast({
        title: "Erro ao desconectar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveManualPixKey() {
    setSavingManualPix(true);
    try {
      const saved = await saveShopManualPixKey(manualPixKey);
      setManualPixKey(saved ?? "");
      toast({ title: "Chave Pix salva" });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSavingManualPix(false);
    }
  }

  async function handlePassFeeToggle(field: "card" | "pix", next: boolean) {
    const prevCard = passFeeCard;
    const prevPix = passFeePix;
    if (field === "card") setPassFeeCard(next);
    else setPassFeePix(next);
    setSaving(true);
    try {
      const updated = await savePaymentPanelSettings({
        payment_pass_fee_card: field === "card" ? next : passFeeCard,
        payment_pass_fee_pix: field === "pix" ? next : passFeePix,
      });
      setSettings(updated);
      applySettingsToForm(updated);
      toast({ title: "Repasse de taxas atualizado" });
    } catch (e) {
      setPassFeeCard(prevCard);
      setPassFeePix(prevPix);
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCentralizationToggle(next: boolean) {
    setCentralized(next);
    setSaving(true);
    try {
      const updated = await savePaymentPanelSettings({ payments_centralized: next });
      setSettings(updated);
      applySettingsToForm(updated);
      notifyCasPaymentsConfigChanged();
      toast({ title: next ? "Pagamentos centralizados" : "Pagamentos descentralizados" });
    } catch (e) {
      setCentralized(!next);
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleResolveException(exceptionId: string) {
    setResolvingId(exceptionId);
    try {
      const { data, error } = await supabase.rpc("resolve_mp_payment_exception", {
        p_exception_id: exceptionId,
      });
      if (error) throw error;
      const row = data as { error?: string; ok?: boolean } | null;
      if (row?.error) throw new Error(row.error);
      toast({ title: "Pendência marcada como resolvida" });
      await loadExceptions();
      notifyPaymentExceptionsChanged();
    } catch (e) {
      toast({
        title: "Não foi possível resolver",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setResolvingId(null);
      setResolveTargetId(null);
    }
  }

  if (loading || subscriptionLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settings?.ca_readonly) {
    const centralizedMessage = settings.readonly_message?.toLowerCase().includes("centraliz");
    return (
      <div className="panel-canvas-page mx-auto max-w-2xl px-4 py-8 space-y-4">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Pagamentos
        </h1>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
              {centralizedMessage ? (
                <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden />
              ) : null}
              <p>{settings.readonly_message}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!subscriptionInfo?.is_admin && !subscriptionInfo?.can_use_appointment_payments) {
    if (subscriptionInfo?.account_type === "ca" || subscriptionInfo?.is_aggregated_account) {
      return (
        <div className="panel-canvas-page mx-auto max-w-2xl px-4 py-8 space-y-4">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            Pagamentos
          </h1>
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground leading-relaxed">
              O titular possui plano Start. Para receber pagamentos, o titular precisa assinar o Pro.
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="panel-canvas-page mx-auto max-w-2xl px-4 py-8 space-y-4">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Pagamentos
        </h1>
        <Card className="border-primary/20">
          <CardContent className="px-6 py-8 space-y-5">
            <p className="text-base md:text-lg text-foreground leading-relaxed">
              Trabalhe com mais praticidade permitindo que seus pacientes paguem ao agendar e diminua os
              cancelamentos de última hora.
            </p>
            <p className="text-sm md:text-base text-muted-foreground">
              Disponível apenas para o plano <strong className="font-semibold text-foreground">Pro</strong>.
            </p>
            <Button asChild className="w-full sm:w-auto rounded-full bg-gradient-brand text-white border-0 px-8">
              <Link to="/app/perfil?destaque=pro">Assinar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const mpStatus = settings?.mp_connect_status ?? "not_connected";
  const mpConnected = settings?.mp_connected === true;
  const canConnectMp = settings?.can_connect_mp !== false;
  const mpManagedByTitular = settings?.mp_managed_by_titular === true;

  return (
    <div className="panel-canvas-page mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Pagamentos
        </h1>
      </div>

      {!loadingExceptions && exceptions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <p>
              {exceptions.length === 1
                ? "1 pagamento precisa de resolução manual."
                : `${exceptions.length} pagamentos precisam de resolução manual.`}
            </p>
          </div>

          <Card className="border-amber-500/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pendências de pagamento</CardTitle>
              <CardDescription>
                Pix confirmado fora do prazo quando o horário já estava ocupado. Resolva com o paciente e marque
                como resolvido quando concluir.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-3">
                {exceptions.map((ex) => (
                  <li
                    key={ex.id}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-sm space-y-2"
                  >
                    <p className="font-medium">{ex.cliente_nome ?? "Cliente"}</p>
                    <p className="text-muted-foreground leading-relaxed">{buildExceptionDescription(ex)}</p>
                    <p className="text-xs text-muted-foreground">
                      Valor pago: {formatMoney(ex.amount_centavos)} · MP #{ex.mp_payment_id} · Horário tentado:{" "}
                      {formatSlotLabel(ex.agendamento_data, ex.agendamento_hora)}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-1 rounded-full"
                      disabled={resolvingId === ex.id}
                      onClick={() => setResolveTargetId(ex.id)}
                    >
                      {resolvingId === ex.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Marcar como resolvido"
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-sm text-muted-foreground -mt-2">
        Conecte o Mercado Pago e centralize recebimentos. As regras de cobrança por agendamento são definidas ao
        marcar &quot;Cobrar&quot; na aba Agendamentos.
      </p>

      <AlertDialog open={resolveTargetId != null} onOpenChange={(open) => !open && setResolveTargetId(null)}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como resolvido?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja marcar como resolvido? Use isso depois de remarcar o paciente ou concluir o
              reembolso no Mercado Pago.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolvingId != null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={resolvingId != null || !resolveTargetId}
              onClick={(event) => {
                event.preventDefault();
                if (resolveTargetId) void handleResolveException(resolveTargetId);
              }}
            >
              {resolvingId != null ? "Salvando…" : "Sim, marcar como resolvido"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {settings?.can_edit_centralization && (
        <Card>
          <CardContent className="pt-6">
            <PermissionToggleRow
              id="payments-centralized"
              label="Centralizar pagamentos"
              description="Ao habilitar esta função todo o valor cobrado por agendamentos de contas agregadas serão transferidos diretamente para a sua conta do Mercado Pago."
              descriptionClassName="text-sm"
              checked={centralized}
              onToggle={() => void handleCentralizationToggle(!centralized)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mercado Pago</CardTitle>
          <CardDescription>
            {mpManagedByTitular
              ? "Recebimentos do seu link público usam a conta Mercado Pago do titular."
              : "Conecte a conta que receberá os pagamentos dos agendamentos do link público."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Status:{" "}
            <span className="font-medium">{MP_STATUS_LABEL[mpStatus] ?? mpStatus}</span>
            {settings?.mp_live_mode === false && (
              <span className="ml-2 text-xs text-muted-foreground">(modo teste)</span>
            )}
            {settings?.mp_live_mode === true && (
              <span className="ml-2 text-xs text-muted-foreground">(produção)</span>
            )}
          </p>

          {mpManagedByTitular ? (
            <p className="text-sm text-muted-foreground rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
              A conexão Mercado Pago é gerenciada pelo titular.
            </p>
          ) : !mpConnected ? (
            <Button
              type="button"
              className="rounded-full"
              disabled={connecting || saving}
              onClick={() => void handleConnect()}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Redirecionando…
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Conectar Mercado Pago
                </>
              )}
            </Button>
          ) : canConnectMp ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-available/40 bg-available-soft text-available-soft-foreground hover:bg-available-soft/80 hover:text-available-soft-foreground"
                disabled={connecting || saving}
                onClick={() => void handleConnect()}
              >
                Reconectar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full text-muted-foreground"
                disabled={saving || connecting}
                onClick={() => void handleDisconnect()}
              >
                Desconectar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!settings?.ca_readonly && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Repassar taxa ao cliente?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PermissionToggleRow
              id="pass-fee-card"
              label="Repasse taxa do cartão ao cliente"
              checked={passFeeCard}
              disabled={saving || connecting}
              onToggle={() => void handlePassFeeToggle("card", !passFeeCard)}
            />
            <PermissionToggleRow
              id="pass-fee-pix"
              label="Repasse taxa do Pix ao cliente"
              checked={passFeePix}
              disabled={saving || connecting}
              onToggle={() => void handlePassFeeToggle("pix", !passFeePix)}
            />
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Verifique sobre as taxas do Mercado Pago:{" "}
        <a
          href="https://www.mercadopago.com.br/ferramentas-para-vender/link-de-pagamento"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          mercadopago.com.br/ferramentas-para-vender/link-de-pagamento
        </a>
      </p>

      {!settings?.ca_readonly && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Prefere cobrar seus pacientes de forma manual?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="manual-pix-key">Insira aqui sua chave PIX:</Label>
              <Input
                id="manual-pix-key"
                value={manualPixKey}
                onChange={(e) => setManualPixKey(e.target.value)}
                placeholder="E-mail, CPF, telefone ou chave aleatória"
                maxLength={140}
                disabled={savingManualPix}
              />
            </div>
            <Button
              type="button"
              className="rounded-full"
              disabled={savingManualPix || saving || connecting}
              onClick={() => void handleSaveManualPixKey()}
            >
              {savingManualPix ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
