import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/features/auth/components/PasswordInput";
import { GoogleButton } from "@/features/auth/components/GoogleButton";
import { SignupEmailOtpForm } from "@/features/auth/components/SignupEmailOtpForm";
import { toast } from "@/hooks/use-toast";
import { authInfoToast } from "@/features/auth/lib/authToast";
import {
  EMAIL_CONFIRMATION_PENDING_MESSAGE,
  isEmailNotConfirmedError,
} from "@/features/auth/lib/authErrors";
import { resendSignupEmailOtp } from "@/features/auth/lib/signupEmailOtp";
import { isEmailVerified } from "@/features/auth/lib/signupCompletion";
import { PageReveal } from "@/components/layout/PageReveal";

type ActivationPhase = "form" | "otp";

async function finishPatientActivation(token: string, authUserId: string) {
  const { error } = await supabase.rpc("concluir_ativacao_paciente", {
    p_token: token,
    p_auth_user_id: authUserId,
  });
  return { error: error?.message ?? null };
}

export default function AtivarContaPacientePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState(true);
  const [valid, setValid] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{
    nome: string;
    whatsapp: string;
    barbearia_nome: string;
  } | null>(null);

  const [phase, setPhase] = useState<ActivationPhase>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const googleCallbackUrl =
    token.length > 0
      ? `${window.location.origin}/auth/callback?flow=patient-activation&token=${encodeURIComponent(token)}`
      : undefined;

  useEffect(() => {
    async function verify() {
      if (!token) {
        setVerifying(false);
        setValid(false);
        return;
      }

      const { data, error } = await supabase.rpc("verify_patient_activation_token", {
        p_token: token,
      });

      setVerifying(false);
      if (error || !data || typeof data !== "object") {
        setValid(false);
        return;
      }

      const res = data as { valid?: boolean; nome?: string; whatsapp?: string; barbearia_nome?: string };
      if (res.valid) {
        setValid(true);
        setTokenInfo({
          nome: res.nome || "Paciente",
          whatsapp: res.whatsapp || "",
          barbearia_nome: res.barbearia_nome || "Clínica",
        });
      } else {
        setValid(false);
      }
    }

    void verify();
  }, [token]);

  async function activateWithSession(session: Session) {
    const authUserId = session.user?.id;
    if (!authUserId) {
      toast({ title: "Não foi possível obter a sessão do usuário", variant: "destructive" });
      return false;
    }

    const { error } = await finishPatientActivation(token, authUserId);
    if (error) {
      toast({ title: "Falha ao vincular paciente", description: error, variant: "destructive" });
      return false;
    }

    setSuccess(true);
    toast({ title: "Conta ativada com sucesso!" });
    return true;
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    setLoading(true);
    const trimmedEmail = email.trim();

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });

    if (!signUpErr && signUpData.user && signUpData.session && isEmailVerified(signUpData.user)) {
      const ok = await activateWithSession(signUpData.session);
      setLoading(false);
      return;
    }

    if (signUpErr) {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInErr) {
        setLoading(false);
        if (isEmailNotConfirmedError(signInErr)) {
          await resendSignupEmailOtp(trimmedEmail);
          authInfoToast(EMAIL_CONFIRMATION_PENDING_MESSAGE);
          setPhase("otp");
          return;
        }
        toast({
          title: "Falha na autenticação",
          description: signInErr.message.includes("Invalid login credentials")
            ? "E-mail já cadastrado. Insira a senha correta da sua conta existente."
            : signInErr.message,
          variant: "destructive",
        });
        return;
      }

      if (signInData.session) {
        const ok = await activateWithSession(signInData.session);
        setLoading(false);
        if (ok) return;
      }
    }

    if (signUpData?.user && !isEmailVerified(signUpData.user)) {
      await resendSignupEmailOtp(trimmedEmail);
      authInfoToast(EMAIL_CONFIRMATION_PENDING_MESSAGE);
      setPhase("otp");
      setLoading(false);
      return;
    }

    if (signUpData?.session) {
      const ok = await activateWithSession(signUpData.session);
      setLoading(false);
      if (ok) return;
    }

    setLoading(false);
    toast({ title: "Não foi possível concluir a ativação", variant: "destructive" });
  }

  async function handleOtpConfirmed(session: Session) {
    setLoading(true);
    await activateWithSession(session);
    setLoading(false);
  }

  if (verifying) {
    return (
      <main className="flex-1 flex items-center justify-center min-h-[70vh] p-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Verificando link de ativação...</p>
        </div>
      </main>
    );
  }

  if (!valid) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Link de ativação inválido ou expirado</h1>
          <p className="text-sm text-muted-foreground">
            O link de ativação pode ter expirado ou já ter sido utilizado. Entre em contato com a clínica para solicitar um novo link.
          </p>
          <Button asChild className="w-full rounded-full">
            <Link to="/login?role=patient">Ir para o Login</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-available/10 text-available">
            <CheckCircle2 className="h-6 w-6 text-available" />
          </div>
          <h1 className="font-display text-xl font-bold">Ativação Concluída!</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada e vinculada aos seus cadastros na clínica <strong>{tokenInfo?.barbearia_nome}</strong>.
          </p>
          <Button
            onClick={() => navigate("/login?role=patient")}
            className="w-full rounded-full bg-gradient-brand text-white shadow-glow"
          >
            Acessar Meus Agendamentos
          </Button>
        </div>
      </main>
    );
  }

  if (phase === "otp") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
          <PageReveal className="flex flex-col gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Confirme seu e-mail</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Digite o código enviado ao seu e-mail para concluir a ativação da conta de paciente.
              </p>
            </div>
            <SignupEmailOtpForm
              email={email.trim()}
              busy={loading}
              onConfirmed={handleOtpConfirmed}
              onBack={() => setPhase("form")}
            />
          </PageReveal>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
      <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
        <PageReveal className="flex flex-col gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Ativar minha conta</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Olá, <strong>{tokenInfo?.nome}</strong>! Crie sua senha para acessar a agenda da clínica <strong>{tokenInfo?.barbearia_nome}</strong>.
            </p>
          </div>

          <GoogleButton
            label="Entrar com Google"
            redirectTo={googleCallbackUrl}
            className="h-11 rounded-xl border-border/80 bg-secondary/40 hover:bg-secondary/70 text-foreground"
          />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border/80" />
            <span>ou crie com e-mail e senha</span>
            <div className="flex-1 h-px bg-border/80" />
          </div>

          <form onSubmit={handleActivate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu.email@exemplo.com"
                className="h-11 rounded-xl border-border/80 bg-secondary/30"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                Crie uma Senha
              </Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Mínimo 6 caracteres"
                className="h-11 rounded-xl border-border/80 bg-secondary/30"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white font-semibold shadow-glow"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Concluir Ativação"}
            </Button>
          </form>
        </PageReveal>
      </div>
    </main>
  );
}
