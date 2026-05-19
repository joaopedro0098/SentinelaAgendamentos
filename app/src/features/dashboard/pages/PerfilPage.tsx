import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CreditCard, Loader2, Mail, Shield, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput, PASSWORD_MIN_LENGTH } from "@/features/auth/components/PasswordInput";
import { toast } from "@/hooks/use-toast";

function formatDateBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const SUPABASE_FUNCTIONS_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
).trim();

async function readFunctionPayload(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as { error?: string; message?: string; [key: string]: unknown };
  } catch {
    return { message: text };
  }
}

async function invokeBillingFunction<T>(functionName: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Faça login novamente para continuar.");
  }

  if (!SUPABASE_FUNCTIONS_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase não configurado no app.");
  }

  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const payload = await readFunctionPayload(response);

  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? "Edge Function retornou erro sem mensagem.");
  }

  return payload as T;
}

export default function PerfilPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { info, loading, refresh } = useSubscription();

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "Perfil — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (user?.email) setNewEmail(user.email);
  }, [user?.email]);

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      const data = await invokeBillingFunction<{ init_point?: string; error?: string }>("mp-create-subscription");
      const initPoint = (data as { init_point?: string })?.init_point;
      if (initPoint) {
        window.location.href = initPoint;
        return;
      }
      throw new Error((data as { error?: string })?.error ?? "Não foi possível iniciar o pagamento.");
    } catch (e) {
      toast({
        title: "Pagamento indisponível",
        description: e instanceof Error ? e.message : "Configure o Mercado Pago ou tente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCancelPlan() {
    if (!confirm("Cancelar a assinatura? Você mantém o acesso até o fim do período já pago.")) return;
    setCancelling(true);
    try {
      const data = await invokeBillingFunction<{ ok?: boolean; error?: string }>("mp-cancel-subscription");
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast({ title: "Assinatura cancelada", description: "O acesso continua até a data de vencimento." });
      await refresh();
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
      description: "Enviamos um link de confirmação para o endereço informado.",
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
    if (info?.subscription_status === "trial") {
      const d = info.trial_days_left ?? 0;
      return d > 0 ? `Teste grátis — ${d} dia${d === 1 ? "" : "s"} restante${d === 1 ? "" : "s"}` : "Teste encerrado";
    }
    if (info?.subscription_status === "active") return "Assinatura ativa";
    if (info?.subscription_status === "grace") return "Pagamento pendente — tolerância";
    if (info?.subscription_status === "cancelled") return "Cancelada (acesso até o vencimento)";
    if (info?.subscription_status === "expired") return "Assinatura inativa";
    return "—";
  })();

  const showPay = !info?.is_admin && !loading && info?.subscription_status !== "active";
  const showCancel =
    !info?.is_admin &&
    Boolean(info?.mp_subscription_id) &&
    (info?.subscription_status === "active" || info?.subscription_status === "grace");

  return (
    <div className="p-4 md:p-8 max-w-lg mx-auto w-full space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Perfil</h1>
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
          <CardDescription>{info?.plan_price_label ?? "R$ 19,90/mês"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            <p className="font-medium">{statusLabel}</p>
            {!info?.is_admin && info?.subscription_status === "trial" && info.trial_last_day && (
              <p className="text-muted-foreground mt-1">Último dia do teste: {formatDateBr(info.trial_last_day)}</p>
            )}
            {!info?.is_admin && info?.current_period_end && info.subscription_status !== "trial" && (
              <p className="text-muted-foreground mt-1">Vencimento: {formatDateBr(info.current_period_end)}</p>
            )}
            {!info?.is_admin && info?.grace_until && (
              <p className="text-muted-foreground mt-1">Tolerância até: {formatDateBr(info.grace_until)}</p>
            )}
          </div>

          {showPay && (
            <Button
              className="w-full rounded-full bg-gradient-brand text-white border-0"
              onClick={handleSubscribe}
              disabled={subscribing}
            >
              {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assinar — R$ 19,90/mês"}
            </Button>
          )}

          {showCancel && (
            <Button variant="outline" className="w-full rounded-full" onClick={handleCancelPlan} disabled={cancelling}>
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar assinatura"}
            </Button>
          )}

          {!info?.can_book && !info?.is_admin && (
            <p className="text-xs text-muted-foreground">
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
