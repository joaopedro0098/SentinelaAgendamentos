import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard, Loader2, Mail, Shield, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { invokeBillingFunction } from "@/lib/billingApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput, PASSWORD_MIN_LENGTH } from "@/features/auth/components/PasswordInput";
import { toast } from "@/hooks/use-toast";
import { PLAN_PRICE_LABEL, PLAN_PRICE_SHORT } from "@/lib/planPricing";

function formatDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export default function PerfilPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { info, loading, refresh } = useSubscription();

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [creatingPix, setCreatingPix] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "Conta — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (user?.email) setNewEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    const stripeReturn = searchParams.get("stripe") === "return";
    const paymentSuccess = searchParams.get("payment") === "success";
    if (!stripeReturn && !paymentSuccess) return;

    const syncFn = stripeReturn ? "stripe-sync-subscription" : "mp-sync-subscription";

    void invokeBillingFunction<{ subscription?: { subscription_status?: string } }>(syncFn)
      .then(async (data) => {
        await refresh({ force: true });
        const status = data.subscription?.subscription_status;
        if (status === "active") {
          toast({ title: "Assinatura ativa", description: "Pagamento confirmado com sucesso." });
        } else if (stripeReturn) {
          toast({
            title: "Pagamento em processamento",
            description: "Se o status não atualizar em instantes, recarregue esta página.",
          });
        } else {
          toast({
            title: "Pagamento recebido?",
            description: "Se o status não atualizar em instantes, recarregue esta página.",
          });
        }
      })
      .catch(() => {
        toast({
          title: "Não foi possível verificar o pagamento",
          description: "Recarregue a página ou tente novamente em instantes.",
          variant: "destructive",
        });
      })
      .finally(() => {
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, setSearchParams, refresh]);

  async function handlePixPayment() {
    setCreatingPix(true);
    try {
      const data = await invokeBillingFunction<{ init_point?: string; error?: string }>("mp-create-pix-payment");
      const initPoint = data.init_point;
      if (initPoint) {
        window.location.href = initPoint;
        return;
      }
      throw new Error(data.error ?? "Não foi possível gerar o pagamento Pix.");
    } catch (e) {
      toast({
        title: "Pix indisponível",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setCreatingPix(false);
    }
  }

  async function handleCancelPlan() {
    if (!info?.stripe_subscription_id) {
      toast({
        title: "Cancelamento indisponível",
        description: "Só assinaturas com cartão (Stripe) podem ser canceladas aqui. Pix é pagamento avulso por mês.",
      });
      return;
    }
    if (!confirm("Cancelar a assinatura? Você mantém o acesso até o fim do período já pago.")) return;
    setCancelling(true);
    try {
      const data = await invokeBillingFunction<{ ok?: boolean; error?: string }>("stripe-cancel-subscription");
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast({ title: "Assinatura cancelada", description: "O acesso continua até a data de vencimento." });
      await refresh({ force: true });
    } catch (e) {
      toast({
        title: "Não foi possível cancelar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    if (error) {
      toast({ title: "Erro ao alterar e-mail", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Confirme o novo e-mail",
      description: "Enviamos um link só para o endereço novo. Clique nele para concluir a alteração.",
    });
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas diferentes", variant: "destructive" });
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      toast({
        title: "Senha curta",
        description: `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`,
        variant: "destructive",
      });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Senha atualizada" });
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleDeleteAccount() {
    if (
      !confirm(
        "Excluir sua conta permanentemente? Todos os dados da barbearia serão removidos. Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", { method: "POST" });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      await signOut();
      navigate("/", { replace: true });
    } catch (e) {
      toast({
        title: "Erro ao excluir conta",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  const statusLabel = (() => {
    if (loading) return "Carregando…";
    if (info?.is_admin) return info.label ?? "Administrador";
    if (info?.subscription_status === "active") return "Assinatura ativa";
    if (info?.subscription_status === "grace") return "Pagamento pendente — tolerância";
    if (info?.subscription_status === "cancelled") return "Cancelada (acesso até o vencimento)";
    if (info?.subscription_status === "expired") return "Assinatura inativa";
    return "—";
  })();

  const showPay = !info?.is_admin && !loading && info?.subscription_status !== "active";
  const hasStripeCard = Boolean(info?.stripe_subscription_id);
  const showCancel =
    !info?.is_admin && info?.subscription_status === "active" && hasStripeCard;

  const showPlanStatus = loading || info?.is_admin || info?.subscription_status !== "trial";

  const showBookingBlockedMessage =
    !info?.is_admin &&
    info?.subscription_status !== "trial" &&
    !info?.can_book &&
    info?.subscription_status !== "grace";

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">Conta, plano e segurança</p>
      </div>

      {info?.subscription_notice && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {info.subscription_notice}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Plano
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showPlanStatus && (
            <div className="text-sm">
              <p className="font-medium">{statusLabel}</p>
              {!info?.is_admin && info?.current_period_end && (
                <p className="text-muted-foreground mt-1">Vencimento: {formatDateBr(info.current_period_end)}</p>
              )}
              {!info?.is_admin && info?.grace_until && (
                <p className="text-muted-foreground mt-1">Tolerância até: {formatDateBr(info.grace_until)}</p>
              )}
            </div>
          )}

          {showPay && (
            <div className="space-y-2">
              <Button
                className="w-full rounded-full bg-gradient-brand text-white border-0"
                onClick={() => navigate("/app/perfil/assinar-cartao")}
                disabled={creatingPix}
              >
                Assinar com cartão — {PLAN_PRICE_LABEL}
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-full"
                onClick={handlePixPayment}
                disabled={creatingPix}
              >
                {creatingPix ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pagar este mês com Pix — ${PLAN_PRICE_SHORT}`}
              </Button>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ao escolher cartão, você será cobrado mensalmente e poderá cancelar aqui mesmo a qualquer momento.
              </p>
            </div>
          )}

          {showCancel && (
            <Button variant="outline" className="w-full rounded-full" onClick={handleCancelPlan} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar assinatura"}
            </Button>
          )}

          {showBookingBlockedMessage && (
            <p className="text-xs text-destructive font-medium">
              Novos agendamentos estão bloqueados. Assine para liberar o painel e o link do cliente.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> E-mail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Novo e-mail</Label>
              <Input id="email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            </div>
            <Button type="submit" variant="outline" size="sm" className="rounded-full" disabled={savingEmail}>
              {savingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar e-mail"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw">Nova senha</Label>
              <PasswordInput id="pw" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} showHint />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirmar senha</Label>
              <PasswordInput
                id="pw2"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                showHint={false}
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="rounded-full" disabled={savingPassword}>
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" /> Zona de perigo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="destructive"
            size="sm"
            className="rounded-full w-full"
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir minha conta"}
          </Button>
          <Button asChild variant="ghost" size="sm" className="w-full rounded-full">
            <Link to="/app/settings">Voltar às configurações</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
