import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionToggleRow } from "@/components/pwa/BarberPushToggle";
import { toast } from "@/hooks/use-toast";
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

export default function PagamentosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  }, [load]);

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

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settings?.ca_readonly) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
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
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Pagamentos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recebimentos de agendamentos pelo link público via Mercado Pago. O painel interno continua sem
          cobrança.
        </p>
      </div>

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
                className="rounded-full"
                disabled={connecting || saving}
                onClick={() => void handleConnect()}
              >
                Reconectar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full"
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
