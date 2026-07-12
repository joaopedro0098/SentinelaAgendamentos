import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Mail, Shield, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput, PASSWORD_MIN_LENGTH } from "@/features/auth/components/PasswordInput";
import { toast } from "@/hooks/use-toast";
import { formatSubscriptionNotice, shouldShowSubscriptionNotice, accountUsesExternalPlan } from "@/lib/subscriptionMessages";
import { BillingProgressNotice } from "@/features/dashboard/components/BillingProgressNotice";
import { PlanoNovoSection } from "@/features/billing/components/PlanoNovoSection";

export default function PerfilPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { info, loading, refresh } = useSubscription();

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [highlightPro, setHighlightPro] = useState(() => searchParams.get("destaque") === "pro");

  useEffect(() => {
    if (location.pathname !== "/app/perfil") return;
    setHighlightPro(searchParams.get("destaque") === "pro");
  }, [location.pathname, searchParams]);

  function dismissProHighlight() {
    setHighlightPro(false);
    if (searchParams.get("destaque")) {
      setSearchParams({}, { replace: true });
    }
  }

  useEffect(() => {
    document.title = "Conta — Sentinela Agendamentos";
    clearSubscriptionCache();
    void refresh({ force: true });
  }, [refresh]);

  useEffect(() => {
    if (user?.email) setNewEmail(user.email);
  }, [user?.email]);

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

  const accountType = info?.account_type;
  const isCaAccount = accountType === "ca" || Boolean(info?.is_aggregated_account);
  const isAaAccount = accountType === "aa" || Boolean(info?.is_admin_aggregated);
  const isAggregated = isCaAccount && Boolean(info?.aggregated_by_email);
  const usesExternalPlan = accountUsesExternalPlan(info);

  const showBookingBlockedMessage =
    !info?.is_admin &&
    !usesExternalPlan &&
    info?.subscription_status !== "trial" &&
    !info?.can_book &&
    info?.subscription_status !== "grace";

  const subscriptionNotice = formatSubscriptionNotice(info?.subscription_notice);
  const showSubscriptionNotice = shouldShowSubscriptionNotice(info, info?.subscription_notice);

  return (
    <div className="panel-canvas-page p-4 md:p-8 max-w-lg mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">Conta, plano e segurança</p>
      </div>

      <BillingProgressNotice info={info} loading={loading} />

      {isCaAccount && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <p className="font-bold">
            {info?.aggregated_by_email
              ? `Conta agregada por ${info.aggregated_by_email}`
              : "Conta agregada"}
          </p>
          <p className="text-muted-foreground mt-1">
            {info?.can_book
              ? "Não é necessária assinatura própria — seus agendamentos usam o plano de quem agregou."
              : "O plano de quem agregou sua conta está inativo. Novos agendamentos estão bloqueados até a renovação ou até você assinar um plano próprio."}
          </p>
        </div>
      )}

      {isAaAccount && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <p className="font-bold">{info?.label ?? "Conta especial"}</p>
          <p className="text-muted-foreground mt-1">
            Acesso garantido pelo administrador — não é necessária assinatura própria.
          </p>
        </div>
      )}

      {showSubscriptionNotice && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          {subscriptionNotice}
        </div>
      )}

      {showBookingBlockedMessage && (
        <p className="text-xs text-destructive font-medium">
          Novos agendamentos estão bloqueados. Assine um plano abaixo para liberar o painel e o link do cliente.
        </p>
      )}

      <PlanoNovoSection
        info={info}
        loading={loading}
        onRefresh={() => refresh({ force: true })}
        highlightPro={highlightPro}
        onDismissProHighlight={dismissProHighlight}
      />

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
            <Button type="submit" size="sm" className="rounded-full" disabled={savingEmail}>
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
            <Button type="submit" size="sm" className="rounded-full" disabled={savingPassword}>
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-red-600 dark:text-red-500">
            <span className="inline-flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Zona de perigo
            </span>
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
        </CardContent>
      </Card>
    </div>
  );
}
