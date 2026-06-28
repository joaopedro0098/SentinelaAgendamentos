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
  fetchPaymentPanelSettings,
  invokePaymentsFunction,
  savePaymentPanelSettings,
  type PaymentPanelSettings,
} from "@/lib/paymentsApi";

const CONNECT_STATUS_LABEL: Record<string, string> = {
  not_connected: "Não conectado",
  pending: "Cadastro em andamento",
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
  const [settings, setSettings] = useState<PaymentPanelSettings | null>(null);

  const [paymentMode, setPaymentMode] = useState("none");
  const [depositType, setDepositType] = useState<"percent" | "fixed">("percent");
  const [depositValue, setDepositValue] = useState("30");
  const [centralized, setCentralized] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data = await fetchPaymentPanelSettings();

      if (
        data.role !== "ca_readonly" &&
        data.stripe_connect_account_id
      ) {
        try {
          await invokePaymentsFunction<{ ok?: boolean; status?: string }>("stripe-connect-sync");
          data = await fetchPaymentPanelSettings();
        } catch {
          /* mantém status do banco se sync falhar */
        }
      }

      setSettings(data);
      if (data.appointment_payment_mode) setPaymentMode(data.appointment_payment_mode);
      if (data.appointment_deposit_type === "fixed" || data.appointment_deposit_type === "percent") {
        setDepositType(data.appointment_deposit_type);
      }
      if (data.appointment_deposit_value != null) setDepositValue(String(data.appointment_deposit_value));
      if (data.payments_centralized != null) setCentralized(data.payments_centralized);
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

      const updated = await savePaymentPanelSettings({
        payments_centralized: settings?.can_edit_centralization ? centralized : undefined,
        appointment_payment_mode: paymentMode,
        appointment_deposit_type: paymentMode === "deposit" ? depositType : null,
        appointment_deposit_value: paymentMode === "deposit" ? depValue : null,
      });
      setSettings(updated);
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
          <p className="text-xs text-muted-foreground">
            V1 aceita cartão (crédito/débito). Pix será adicionado depois.
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
