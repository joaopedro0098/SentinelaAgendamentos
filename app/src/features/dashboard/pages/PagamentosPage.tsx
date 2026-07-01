import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExternalLink, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionToggleRow } from "@/components/pwa/BarberPushToggle";
import { toast } from "@/hooks/use-toast";
import {
  disconnectMpAccount,
  fetchPaymentPanelSettings,
  savePaymentPanelSettings,
  startMpOAuth,
  type PaymentPanelSettings,
} from "@/lib/paymentsApi";

const MP_STATUS_LABEL: Record<string, string> = {
  not_connected: "Não conectado",
  connected: "Conectado",
  token_expired: "Token expirado — reconecte",
};

export default function PagamentosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [settings, setSettings] = useState<PaymentPanelSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentPanelSettings();
      if (data.error && data.error !== "no_shop") {
        throw new Error(data.error);
      }
      setSettings(data);
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
    setSaving(true);
    try {
      const updated = await savePaymentPanelSettings({ payments_centralized: next });
      setSettings(updated);
      toast({ title: next ? "Pagamentos centralizados" : "Pagamentos descentralizados" });
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Pagamentos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recebimentos de agendamentos pelo link público via Mercado Pago.
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
              checked={settings.payments_centralized ?? true}
              onToggle={() => void handleCentralizationToggle(!(settings.payments_centralized ?? true))}
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

          <p className="text-xs text-muted-foreground leading-relaxed">
            Use uma <strong>conta vendedor de teste</strong> do Mercado Pago ao conectar em ambiente de
            desenvolvimento. As configurações de cobrança (integral, sinal, Pix/cartão, parcelas) entram na
            próxima fase.
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Dúvidas sobre credenciais? Veja{" "}
        <Link to="/app/perfil" className="underline underline-offset-2">
          Conta
        </Link>{" "}
        para assinatura Sentinela (Pix/Stripe) — separado dos pagamentos de agendamento.
      </p>
    </div>
  );
}
