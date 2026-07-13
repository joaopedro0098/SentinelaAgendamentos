import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
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
import { PermissionToggleRow } from "@/components/pwa/BarberPushToggle";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { notifyPaymentExceptionsChanged } from "@/features/dashboard/hooks/usePendingPaymentExceptions";
import { buildSlotTakenLatePaymentMessage } from "@/lib/mpPaymentExceptionMessages";
import {
  disconnectMpAccount,
  fetchPaymentPanelSettings,
  formatDepositFixedReais,
  parseDepositFixedReais,
  paymentModeLabel,
  savePaymentPanelSettings,
  startMpOAuth,
  type AppointmentDepositType,
  type AppointmentPaymentMode,
  type PaymentPanelSettings,
} from "@/lib/paymentsApi";

const MP_STATUS_LABEL: Record<string, string> = {
  not_connected: "Não conectado",
  connected: "Conectado",
  token_expired: "Token expirado — reconecte",
};

const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [settings, setSettings] = useState<PaymentPanelSettings | null>(null);

  const [paymentMode, setPaymentMode] = useState<AppointmentPaymentMode>("none");
  const [depositType, setDepositType] = useState<AppointmentDepositType>("percent");
  const [depositPercent, setDepositPercent] = useState("30");
  const [depositFixedReais, setDepositFixedReais] = useState("50,00");
  const [centralized, setCentralized] = useState(true);
  const [enableCard, setEnableCard] = useState(true);
  const [enablePix, setEnablePix] = useState(true);
  const [passFeeCard, setPassFeeCard] = useState(false);
  const [passFeePix, setPassFeePix] = useState(false);
  const [maxInstallments, setMaxInstallments] = useState("1");
  const [exceptions, setExceptions] = useState<MpPaymentException[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);

  const applySettingsToForm = useCallback((data: PaymentPanelSettings) => {
    if (data.appointment_payment_mode) setPaymentMode(data.appointment_payment_mode);
    if (data.appointment_deposit_type === "fixed" || data.appointment_deposit_type === "percent") {
      setDepositType(data.appointment_deposit_type);
    }
    if (data.appointment_deposit_value != null) {
      if (data.appointment_deposit_type === "fixed") {
        setDepositFixedReais(formatDepositFixedReais(data.appointment_deposit_value));
      } else {
        setDepositPercent(String(data.appointment_deposit_value));
      }
    }
    if (data.payments_centralized != null) setCentralized(data.payments_centralized);
    if (data.payment_enable_card != null) setEnableCard(data.payment_enable_card);
    if (data.payment_enable_pix != null) setEnablePix(data.payment_enable_pix);
    if (data.payment_pass_fee_card != null) setPassFeeCard(data.payment_pass_fee_card);
    if (data.payment_pass_fee_pix != null) setPassFeePix(data.payment_pass_fee_pix);
    if (data.payment_max_installments != null) setMaxInstallments(String(data.payment_max_installments));
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentPanelSettings();
      if (data.error && data.error !== "no_shop") {
        throw new Error(data.error);
      }
      setSettings(data);
      if (!data.ca_readonly) applySettingsToForm(data);
    } catch (e) {
      toast({
        title: "Erro ao carregar pagamentos",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [applySettingsToForm]);

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

  async function handleCentralizationToggle(next: boolean) {
    setCentralized(next);
    setSaving(true);
    try {
      const updated = await savePaymentPanelSettings({ payments_centralized: next });
      setSettings(updated);
      applySettingsToForm(updated);
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

  async function handleSave() {
    setSaving(true);
    try {
      let depositValue: number | null = null;
      if (paymentMode === "deposit") {
        if (depositType === "percent") {
          depositValue = Math.min(100, Math.max(1, parseInt(depositPercent, 10) || 0));
        } else {
          depositValue = parseDepositFixedReais(depositFixedReais);
          if (depositValue < 50) {
            throw new Error("Valor fixo do sinal deve ser de pelo menos R$ 0,50.");
          }
        }
      }

      const updated = await savePaymentPanelSettings({
        payments_centralized: settings?.can_edit_centralization ? centralized : undefined,
        appointment_payment_mode: paymentMode,
        appointment_deposit_type: paymentMode === "deposit" ? depositType : null,
        appointment_deposit_value: paymentMode === "deposit" ? depositValue : null,
        payment_enable_card: enableCard,
        payment_enable_pix: enablePix,
        payment_pass_fee_card: passFeeCard,
        payment_pass_fee_pix: passFeePix,
        payment_max_installments: enableCard ? parseInt(maxInstallments, 10) || 1 : 1,
      });
      setSettings(updated);
      applySettingsToForm(updated);
      toast({ title: "Configurações salvas" });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Verifique os dados e tente novamente.",
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

  if (!subscriptionInfo?.is_admin && !subscriptionInfo?.can_use_appointment_payments) {
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

  if (settings?.ca_readonly) {
    return (
      <div className="panel-canvas-page mx-auto max-w-2xl px-4 py-8 space-y-4">
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Pagamentos
        </h1>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground leading-relaxed">
            {settings.readonly_message}
          </CardContent>
        </Card>
      </div>
    );
  }

  const mpStatus = settings?.mp_connect_status ?? "not_connected";
  const mpConnected = settings?.mp_connected === true;
  const chargeEnabled = paymentMode !== "none";
  const canSaveCharge =
    !chargeEnabled || (mpConnected && (enableCard || enablePix));

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
        Recebimentos de agendamentos pelo link público via Mercado Pago. O painel interno continua sem cobrança.
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
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contas agregadas (CA)</CardTitle>
            <CardDescription>
              Centralize pagamentos na conta MP do titular ou deixe cada CA conectar a própria conta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PermissionToggleRow
              id="payments-centralized"
              label="Centralizar pagamentos das contas agregadas"
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
            Conecte a conta que receberá os pagamentos dos agendamentos do link público.
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

          {!mpConnected ? (
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
          ) : (
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobrança no link público</CardTitle>
          <CardDescription>Modo atual: {paymentModeLabel(settings?.appointment_payment_mode)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {chargeEnabled && !mpConnected && (
            <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              Conecte sua conta Mercado Pago antes de exigir pagamento no link público.
            </p>
          )}

          {chargeEnabled && settings?.has_priced_services === false && (
            <p className="text-sm text-amber-700 dark:text-amber-400 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              Nenhum serviço ativo com preço cadastrado. Agendamentos com serviços gratuitos ou sem preço
              seguirão sem cobrança. Cadastre preços em{" "}
              <Link to="/app/profissionais" className="underline font-medium">
                Profissionais
              </Link>
              .
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="payment-mode">Modo de cobrança</Label>
            <select
              id="payment-mode"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as AppointmentPaymentMode)}
            >
              <option value="none">Sem cobrança</option>
              <option value="deposit">Sinal (parte do valor)</option>
              <option value="full">Pagamento integral</option>
            </select>
          </div>

          {paymentMode === "deposit" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deposit-type">Tipo de sinal</Label>
                <select
                  id="deposit-type"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={depositType}
                  onChange={(e) => setDepositType(e.target.value as AppointmentDepositType)}
                >
                  <option value="percent">Percentual do total</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit-value">
                  {depositType === "percent" ? "Percentual (%)" : "Valor do sinal (R$)"}
                </Label>
                {depositType === "percent" ? (
                  <Input
                    id="deposit-value"
                    inputMode="numeric"
                    value={depositPercent}
                    onChange={(e) => setDepositPercent(e.target.value.replace(/\D/g, ""))}
                  />
                ) : (
                  <Input
                    id="deposit-value"
                    inputMode="decimal"
                    placeholder="50,00"
                    value={depositFixedReais}
                    onChange={(e) => setDepositFixedReais(e.target.value)}
                  />
                )}
              </div>
            </div>
          )}

          {paymentMode === "deposit" && (
            <p className="text-xs text-muted-foreground">
              O restante do valor é pago presencialmente no estabelecimento — não há segunda cobrança online.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Só entram na soma serviços com preço cadastrado; serviços sem preço ou R$ 0 são gratuitos. A reserva
            fica válida por 15 minutos aguardando pagamento; depois disso o horário é liberado.
          </p>
        </CardContent>
      </Card>

      {chargeEnabled && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Meios de pagamento</CardTitle>
              <CardDescription>Escolha o que o cliente pode usar no link público.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PermissionToggleRow
                id="payment-enable-card"
                label="Cartão de crédito"
                checked={enableCard}
                onToggle={() => setEnableCard((v) => !v)}
              />
              <PermissionToggleRow
                id="payment-enable-pix"
                label="Pix"
                checked={enablePix}
                onToggle={() => setEnablePix((v) => !v)}
              />
              {!enableCard && !enablePix && (
                <p className="text-sm text-destructive">Ative cartão ou Pix para cobrar no link público.</p>
              )}
            </CardContent>
          </Card>

          {enableCard && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Parcelas no cartão</CardTitle>
                <CardDescription>
                  Máximo de parcelas oferecidas ao cliente (taxas definidas pelo Mercado Pago).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="max-installments">Até quantas vezes</Label>
                  <select
                    id="max-installments"
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={maxInstallments}
                    onChange={(e) => setMaxInstallments(e.target.value)}
                  >
                    {INSTALLMENT_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Repasse de taxas</CardTitle>
              <CardDescription>
                As taxas são definidas pelo Mercado Pago. Ao repassar, o valor cobrado ao cliente inclui a taxa
                estimada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PermissionToggleRow
                id="pass-fee-card"
                label="Repasse taxa do cartão ao cliente"
                checked={passFeeCard}
                onToggle={() => setPassFeeCard((v) => !v)}
              />
              <PermissionToggleRow
                id="pass-fee-pix"
                label="Repasse taxa do Pix ao cliente"
                checked={passFeePix}
                onToggle={() => setPassFeePix((v) => !v)}
              />
            </CardContent>
          </Card>
        </>
      )}

      <Button
        type="button"
        className="rounded-full w-full sm:w-auto"
        disabled={saving || connecting || !canSaveCharge}
        onClick={() => void handleSave()}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar configurações"}
      </Button>

      <p className="text-xs text-muted-foreground">
        Dúvidas sobre assinatura Sentinela (Pix/Stripe mensal)? Veja{" "}
        <Link to="/app/perfil" className="underline underline-offset-2">
          Conta
        </Link>{" "}
        — separado dos pagamentos de agendamento.
      </p>
    </div>
  );
}
