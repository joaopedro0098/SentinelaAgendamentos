import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CreditCard, ExternalLink, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PermissionToggleRow } from "@/components/pwa/BarberPushToggle";
import { toast } from "@/hooks/use-toast";
import {
  buildInstallmentRatesForSave,
  clampInstallmentSurchargePercent,
  fetchPaymentPanelSettings,
  INSTALLMENT_MAX_OPTIONS,
  INSTALLMENT_STRIPE_PERCENT,
  invokePaymentsFunction,
  isStripePublishableTestMode,
  MIN_INSTALLMENT_SURCHARGE_PERCENT,
  parseInstallmentRatesFromSettings,
  savePaymentPanelSettings,
  showConnectTestSeedUi,
  type PaymentPanelSettings,
} from "@/lib/paymentsApi";

const CONNECT_STATUS_LABEL: Record<string, string> = {
  not_connected: "Não conectado",
  pending: "Verificando na Stripe (aguarde e recarregue)",
  connected: "Conectado",
  restricted: "Restrito — complete o cadastro na Stripe",
};

function paymentModeLabel(mode: string | undefined) {
  switch (mode) {
    case "deposit":
      return "Sinal (parte do valor)";
    case "full":
      return "Pagamento integral";
    default:
      return "Sem cobrança no link público";
  }
}

export default function PagamentosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [seedingTest, setSeedingTest] = useState(false);
  const [settings, setSettings] = useState<PaymentPanelSettings | null>(null);

  const [paymentMode, setPaymentMode] = useState("none");
  const [depositType, setDepositType] = useState<"percent" | "fixed">("percent");
  const [depositValue, setDepositValue] = useState("30");
  const [centralized, setCentralized] = useState(true);
  const [installmentPassFee, setInstallmentPassFee] = useState(false);
  const [installmentMaxCount, setInstallmentMaxCount] = useState("");
  const [installmentRates, setInstallmentRates] = useState<Record<number, string>>({});
  const [pixSyncInfo, setPixSyncInfo] = useState<{
    connectLabel?: string;
    platformLabel?: string;
    enabledOnCheckout?: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data = await fetchPaymentPanelSettings();

      if (
        data.role !== "ca_readonly" &&
        data.stripe_connect_account_id
      ) {
        try {
          const sync = await invokePaymentsFunction<{
            ok?: boolean;
            status?: string;
            pix_connect_label?: string;
            pix_platform_label?: string;
            pix_enabled_on_checkout?: boolean;
          }>("stripe-connect-sync");
          setPixSyncInfo({
            connectLabel: sync.pix_connect_label,
            platformLabel: sync.pix_platform_label,
            enabledOnCheckout: sync.pix_enabled_on_checkout,
          });
          data = await fetchPaymentPanelSettings();
        } catch {
          /* mantém status do banco se sync falhar */
        }
      } else {
        setPixSyncInfo(null);
      }

      setSettings(data);
      if (data.appointment_payment_mode) setPaymentMode(data.appointment_payment_mode);
      if (data.appointment_deposit_type === "fixed" || data.appointment_deposit_type === "percent") {
        setDepositType(data.appointment_deposit_type);
      }
      if (data.appointment_deposit_value != null) setDepositValue(String(data.appointment_deposit_value));
      if (data.payments_centralized != null) setCentralized(data.payments_centralized);
      setInstallmentPassFee(data.installment_pass_fee_to_client ?? false);
      const max = data.installment_max_count;
      const maxStr = max != null && max >= 2 ? String(max) : "";
      setInstallmentMaxCount(maxStr);
      const parsedRates = parseInstallmentRatesFromSettings(data.installment_surcharge_rates);
      if (max != null && max >= 2) {
        for (let i = 2; i <= max; i += 1) {
          if (!parsedRates[i]) parsedRates[i] = String(MIN_INSTALLMENT_SURCHARGE_PERCENT);
        }
      }
      setInstallmentRates(parsedRates);
    } catch (e) {
      toast({
        title: "Erro ao carregar pagamentos",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Pagamentos — Sentinela Agendamentos";
    void load();
  }, [load]);

  useEffect(() => {
    const stripeParam = searchParams.get("stripe");
    if (stripeParam !== "return" && stripeParam !== "refresh") return;

    void invokePaymentsFunction<{ ok?: boolean; status?: string }>("stripe-connect-sync")
      .then(async () => {
        await load();
        toast({
          title: stripeParam === "return" ? "Cadastro Stripe atualizado" : "Continue o cadastro",
          description:
            stripeParam === "return"
              ? "Verificamos o status da sua conta de recebimento."
              : "Abra novamente o link de cadastro se necessário.",
        });
      })
      .catch(() => {
        toast({
          title: "Não foi possível sincronizar",
          description: "Recarregue a página em instantes.",
          variant: "destructive",
        });
      })
      .finally(() => setSearchParams({}, { replace: true }));
  }, [searchParams, setSearchParams, load]);

  const readonly = settings?.role === "ca_readonly";

  async function handleConnect() {
    setConnecting(true);
    try {
      const data = await invokePaymentsFunction<{ url?: string; error?: string }>("stripe-connect-onboard");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error ?? "Não foi possível abrir o cadastro Stripe.");
    } catch (e) {
      toast({
        title: "Conexão Stripe",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setConnecting(false);
    }
  }

  async function handleSeedTestConnect() {
    setSeedingTest(true);
    try {
      const data = await invokePaymentsFunction<{
        ok?: boolean;
        account_id?: string;
        status?: string;
        charges_enabled?: boolean;
        requirements_due?: string[];
        pending_verification?: string[];
        disabled_reason?: string | null;
        message?: string;
        error?: string;
      }>("stripe-connect-seed-test-account");

      await load();
      const verifying =
        data.disabled_reason === "requirements.pending_verification" ||
        (data.pending_verification?.length ?? 0) > 0;
      const pending = (data.requirements_due ?? []).slice(0, 3).join(", ");
      toast({
        title: data.charges_enabled
          ? "Conta de teste conectada"
          : verifying
            ? "Stripe verificando a conta"
            : "Conta criada — ainda não cobra",
        description: data.charges_enabled
          ? (data.message ?? `ID ${data.account_id ?? ""}`)
          : verifying
            ? (data.message ??
              "Aguarde 1–2 minutos e recarregue Pagamentos. Não é erro — a Stripe revisa CPF/endereço em segundo plano.")
            : [
                data.message,
                data.disabled_reason ? `Motivo Stripe: ${data.disabled_reason}` : null,
                pending ? `Pendente: ${pending}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
        variant: data.charges_enabled || verifying ? "default" : "destructive",
      });
    } catch (e) {
      toast({
        title: "Não foi possível criar conta de teste",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSeedingTest(false);
    }
  }

  function handleInstallmentMaxChange(value: string) {
    setInstallmentMaxCount(value);
    if (!value) {
      setInstallmentRates({});
      return;
    }
    const max = parseInt(value, 10);
    if (!Number.isFinite(max) || max < 2) return;
    setInstallmentRates((prev) => {
      const next = { ...prev };
      for (let i = 2; i <= max; i += 1) {
        if (!next[i]) next[i] = String(MIN_INSTALLMENT_SURCHARGE_PERCENT);
      }
      for (const key of Object.keys(next)) {
        const n = parseInt(key, 10);
        if (n > max) delete next[n];
      }
      return next;
    });
  }

  function handleInstallmentRateChange(count: number, raw: string) {
    const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    setInstallmentRates((prev) => ({ ...prev, [count]: cleaned }));
  }

  function handleInstallmentRateBlur(count: number) {
    setInstallmentRates((prev) => {
      const parsed = parseFloat(String(prev[count] ?? "").replace(",", "."));
      return {
        ...prev,
        [count]: String(clampInstallmentSurchargePercent(parsed)),
      };
    });
  }

  async function handleSave() {
    if (readonly) return;
    setSaving(true);
    try {
      const depValue =
        paymentMode === "deposit"
          ? depositType === "percent"
            ? Math.min(100, Math.max(1, parseInt(depositValue, 10) || 0))
            : Math.max(50, parseInt(depositValue, 10) || 0)
          : null;

      const maxParsed = installmentMaxCount ? parseInt(installmentMaxCount, 10) : null;
      const installmentMax =
        maxParsed != null && Number.isFinite(maxParsed) && maxParsed >= 2
          ? Math.min(12, maxParsed)
          : null;

      const updated = await savePaymentPanelSettings({
        payments_centralized: settings?.can_edit_centralization ? centralized : undefined,
        appointment_payment_mode: paymentMode,
        appointment_deposit_type: paymentMode === "deposit" ? depositType : null,
        appointment_deposit_value: paymentMode === "deposit" ? depValue : null,
        installment_pass_fee_to_client: installmentPassFee,
        installment_max_count: installmentMax,
        installment_surcharge_rates:
          installmentMax != null ? buildInstallmentRatesForSave(installmentMax, installmentRates) : {},
      });
      setSettings(updated);
      setInstallmentPassFee(updated.installment_pass_fee_to_client ?? false);
      const max = updated.installment_max_count;
      setInstallmentMaxCount(max != null && max >= 2 ? String(max) : "");
      setInstallmentRates(parseInstallmentRatesFromSettings(updated.installment_surcharge_rates));
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
      <div className="p-4 md:p-8 flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (readonly) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Pagamentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{settings?.message}</p>
        </div>
      </div>
    );
  }

  const connectStatus = settings?.stripe_connect_status ?? "not_connected";
  const missingPrices = settings?.all_services_have_prices === false;
  const paymentModeActive = paymentMode !== "none";
  const connectBlocksPayment = paymentModeActive && connectStatus !== "connected";
  const stripeTestMode = isStripePublishableTestMode();
  const showTestSeedUi = showConnectTestSeedUi();
  const installmentMaxParsed = installmentMaxCount ? parseInt(installmentMaxCount, 10) : 0;
  const showInstallmentTable = Number.isFinite(installmentMaxParsed) && installmentMaxParsed >= 2;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Pagamentos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Receba pelo link público de agendamento. O painel &quot;Agendar&quot; continua sem cobrança.
        </p>
      </div>

      {settings?.can_edit_centralization && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Centralização (contas agregadas)</CardTitle>
            <CardDescription>
              Com centralização ativa, só o titular conecta a Stripe e recebe os pagamentos das contas agregadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PermissionToggleRow
              id="centralized"
              label="Centralizar pagamentos no titular"
              checked={centralized}
              onToggle={() => setCentralized((v) => !v)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Conta Stripe
          </CardTitle>
          <CardDescription>
            Status:{" "}
            <span className="font-medium text-foreground">
              {CONNECT_STATUS_LABEL[connectStatus] ?? connectStatus}
            </span>
            {settings?.stripe_connect_email ? ` · ${settings.stripe_connect_email}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            className="rounded-full"
            variant={connectStatus === "connected" ? "outline" : "default"}
            disabled={connecting}
            onClick={handleConnect}
          >
            {connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : connectStatus === "connected" ? (
              <>
                Atualizar cadastro Stripe <ExternalLink className="h-4 w-4 ml-2" />
              </>
            ) : (
              "Conectar conta Stripe"
            )}
          </Button>
          {showTestSeedUi && connectStatus !== "connected" && (
            <p className="text-xs text-amber-700 dark:text-amber-200 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 leading-relaxed">
              Se aparecer <strong>Restrito</strong> após criar a conta de teste, o link público{" "}
              <strong>ainda não cobra</strong>. Use de novo &quot;Criar conta Stripe de teste&quot; (após deploy da
              function) ou conclua o cadastro na Stripe. Só siga com <strong>Conectado</strong>.
            </p>
          )}
          {showTestSeedUi && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 space-y-2">
              {!stripeTestMode && import.meta.env.DEV && (
                <p className="text-xs text-amber-800 dark:text-amber-100 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
                  Adicione <code className="text-[11px]">VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...</code> em{" "}
                  <code className="text-[11px]">app/.env</code> e reinicie <code className="text-[11px]">npm run dev</code>{" "}
                  para o checkout no link público. O botão abaixo funciona se o Supabase tiver{" "}
                  <code className="text-[11px]">sk_test_</code>.
                </p>
              )}
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Modo teste Stripe</strong> — chaves <code className="text-[11px]">pk_test_</code> /{" "}
                <code className="text-[11px]">sk_test_</code>. Contas Connect de teste são separadas das de produção. Se o onboarding
                da Stripe travar (comum no Brasil), use o botão abaixo para criar uma conta de teste via API, sem formulário.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="rounded-full w-full sm:w-auto"
                disabled={seedingTest || connecting}
                onClick={handleSeedTestConnect}
              >
                {seedingTest ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Criar conta Stripe de teste (sem onboarding)"
                )}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Link público: cartão (crédito/débito)
            {pixSyncInfo?.enabledOnCheckout
              ? " e Pix"
              : connectStatus === "connected"
                ? ". Pix será oferecido quando a Stripe liberar na conta conectada"
                : ""}
            .
            {connectStatus === "connected" && pixSyncInfo && (
              <>
                {" "}
                Pix na conta conectada:{" "}
                <span className="font-medium text-foreground">{pixSyncInfo.connectLabel ?? "—"}</span>
                {pixSyncInfo.platformLabel ? (
                  <>
                    {" "}
                    · plataforma:{" "}
                    <span className="font-medium text-foreground">{pixSyncInfo.platformLabel}</span>
                  </>
                ) : null}
              </>
            )}
            {connectStatus === "pending" && (
              <>
                {" "}
                Se você já concluiu o cadastro na Stripe, aguarde alguns segundos ou clique em
                &quot;Atualizar cadastro Stripe&quot; para sincronizar.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobrança no link público</CardTitle>
          <CardDescription>Modo atual: {paymentModeLabel(settings?.appointment_payment_mode)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectBlocksPayment && (
            <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              Cobrança ativa no painel, mas a Stripe não está conectada. Clientes no link público{" "}
              <strong>não pagarão</strong> até você clicar em &quot;Conectar conta Stripe&quot; e concluir o cadastro
              (use o mesmo modo teste/live das chaves configuradas).
            </p>
          )}
          {missingPrices && (
            <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              Cadastre o preço de todos os serviços ativos em{" "}
              <Link to="/app/profissionais" className="underline font-medium">
                Profissionais
              </Link>{" "}
              antes de exigir pagamento.
            </p>
          )}

          <div className="space-y-2">
            <Label>Modo de cobrança</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
            >
              <option value="none">Sem cobrança</option>
              <option value="deposit">Sinal (parte do valor)</option>
              <option value="full">Pagamento integral</option>
            </select>
          </div>

          {paymentMode === "deposit" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo de sinal</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={depositType}
                  onChange={(e) => setDepositType(e.target.value as "percent" | "fixed")}
                >
                  <option value="percent">Percentual do total</option>
                  <option value="fixed">Valor fixo (centavos)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{depositType === "percent" ? "Percentual (%)" : "Valor (centavos)"}</Label>
                <Input
                  inputMode="numeric"
                  value={depositValue}
                  onChange={(e) => setDepositValue(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            O valor cobrado é a soma dos preços cadastrados dos serviços escolhidos. Reserva válida por 15 minutos;
            após isso ou em caso de falha, o agendamento é cancelado (mantido no histórico).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parcelamento no cartão</CardTitle>
          <CardDescription>
            Opções de parcelas no link público. Pagamento em 1x não inclui acréscimo de parcelamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentMode === "none" && (
            <p className="text-sm text-muted-foreground rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
              Ative a cobrança no link público acima para o parcelamento valer no checkout.
            </p>
          )}

          <PermissionToggleRow
            id="installment-pass-fee"
            label="Repassar acréscimo de parcelamento ao cliente"
            checked={installmentPassFee}
            onToggle={() => setInstallmentPassFee((v) => !v)}
          />

          <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground space-y-1">
            <p>
              Taxa percentual Stripe:{" "}
              <span className="font-medium text-foreground">{INSTALLMENT_STRIPE_PERCENT.toLocaleString("pt-BR")}%</span>
            </p>
            <p>
              Taxa fixa por transação:{" "}
              <span className="font-medium text-foreground">R$ 0,39</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Máximo de parcelas</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={installmentMaxCount}
              onChange={(e) => handleInstallmentMaxChange(e.target.value)}
            >
              <option value="">Sem parcelamento (apenas 1x)</option>
              {INSTALLMENT_MAX_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>
                  Até {n}x
                </option>
              ))}
            </select>
          </div>

          {showInstallmentTable && (
            <div className="space-y-2">
              <Label>Acréscimo por faixa (%)</Label>
              <div className="rounded-lg border border-border/80 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/80 bg-muted/30">
                      <th className="text-left font-medium px-3 py-2">Parcelas</th>
                      <th className="text-left font-medium px-3 py-2">Acréscimo (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: installmentMaxParsed - 1 }, (_, idx) => idx + 2).map((count) => (
                      <tr key={count} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{count}x</td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            className="h-9 max-w-[7rem]"
                            value={installmentRates[count] ?? String(MIN_INSTALLMENT_SURCHARGE_PERCENT)}
                            onChange={(e) => handleInstallmentRateChange(count, e.target.value)}
                            onBlur={() => handleInstallmentRateBlur(count)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo de {MIN_INSTALLMENT_SURCHARGE_PERCENT.toLocaleString("pt-BR")}% por faixa.
              </p>
            </div>
          )}

          <Button
            type="button"
            className="rounded-full w-full sm:w-auto"
            disabled={saving || (paymentMode !== "none" && !settings?.can_enable_payment)}
            onClick={handleSave}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar configurações"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
