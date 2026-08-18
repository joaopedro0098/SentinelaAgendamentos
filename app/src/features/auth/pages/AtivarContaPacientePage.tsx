import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
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
  isEmailAlreadyRegistered,
} from "@/features/auth/lib/authErrors";
import { resendSignupEmailOtp } from "@/features/auth/lib/signupEmailOtp";
import { isEmailVerified } from "@/features/auth/lib/signupCompletion";
import { getPatientActivationSuccessPath } from "@/features/auth/lib/postLoginPaths";
import {
  PASSWORDS_MISMATCH_MESSAGE,
  patientActivationSchema,
} from "@/features/auth/lib/patientActivationSchema";
import { PageReveal } from "@/components/layout/PageReveal";

type ActivationPhase = "form" | "otp";

type PageState =
  | "loading"
  | "form"
  | "already_has_account"
  | "token_already_used"
  | "token_expired"
  | "invalid";

type TokenInfo = {
  nome: string;
  whatsapp: string;
  barbearia_nome: string;
  barbearia_slug: string | null;
};

type VerifyTokenResponse = {
  valid?: boolean;
  reason?: string;
  nome?: string;
  whatsapp?: string;
  barbearia_nome?: string;
  barbearia_slug?: string | null;
};

type ConcluirAtivacaoResponse = {
  error?: string;
  success?: boolean;
  barbearia_slug?: string | null;
};

async function finishPatientActivation(token: string, authUserId: string) {
  const { data, error } = await supabase.rpc("concluir_ativacao_paciente", {
    p_token: token,
    p_auth_user_id: authUserId,
  });
  if (error) return { error: error.message };
  const row = data as ConcluirAtivacaoResponse | null;
  if (row?.error) return { error: row.error };
  return { slug: row?.barbearia_slug ?? null };
}

export default function AtivarContaPacientePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);

  const [phase, setPhase] = useState<ActivationPhase>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const googleCallbackUrl =
    token.length > 0
      ? `${window.location.origin}/auth/callback?flow=patient-activation&token=${encodeURIComponent(token)}`
      : undefined;

  useEffect(() => {
    async function verify() {
      if (!token) {
        setPageState("invalid");
        return;
      }

      const { data, error } = await supabase.rpc("verify_patient_activation_token", {
        p_token: token,
      });

      if (error || !data || typeof data !== "object") {
        setPageState("invalid");
        return;
      }

      const res = data as VerifyTokenResponse;

      if (res.reason === "already_has_account") {
        setTokenInfo({
          nome: res.nome || "Paciente",
          whatsapp: res.whatsapp || "",
          barbearia_nome: res.barbearia_nome || "Clínica",
          barbearia_slug: res.barbearia_slug ?? null,
        });
        setPageState("already_has_account");
        return;
      }

      if (res.reason === "already_used") {
        setTokenInfo({
          nome: res.nome || "Paciente",
          whatsapp: res.whatsapp || "",
          barbearia_nome: res.barbearia_nome || "Clínica",
          barbearia_slug: res.barbearia_slug ?? null,
        });
        setPageState("token_already_used");
        return;
      }

      if (res.reason === "expired") {
        setPageState("token_expired");
        return;
      }

      if (res.valid) {
        setTokenInfo({
          nome: res.nome || "Paciente",
          whatsapp: res.whatsapp || "",
          barbearia_nome: res.barbearia_nome || "Clínica",
          barbearia_slug: res.barbearia_slug ?? null,
        });
        setPageState("form");
        return;
      }

      setPageState("invalid");
    }

    void verify();
  }, [token]);

  function redirectAfterActivation(slug: string | null | undefined) {
    const path = getPatientActivationSuccessPath(slug ?? tokenInfo?.barbearia_slug);
    navigate(path, { replace: true });
  }

  async function activateWithSession(session: Session) {
    const authUserId = session.user?.id;
    if (!authUserId) {
      toast({ title: "Não foi possível obter a sessão do usuário", variant: "destructive" });
      return false;
    }

    const result = await finishPatientActivation(token, authUserId);
    if (result.error) {
      toast({ title: "Falha ao vincular paciente", description: result.error, variant: "destructive" });
      return false;
    }

    toast({ title: "Conta ativada com sucesso!" });
    redirectAfterActivation(result.slug);
    return true;
  }

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();

    const parsed = patientActivationSchema.safeParse({
      email,
      password,
      confirm_password: confirmPassword,
    });

    if (!parsed.success) {
      const mismatch = parsed.error.issues.some((issue) => issue.message === PASSWORDS_MISMATCH_MESSAGE);
      if (mismatch) {
        authInfoToast(PASSWORDS_MISMATCH_MESSAGE);
        return;
      }
      toast({
        title: "Dados inválidos",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const trimmedEmail = parsed.data.email;

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: parsed.data.password,
    });

    if (!signUpErr && signUpData.user && signUpData.session && isEmailVerified(signUpData.user)) {
      await activateWithSession(signUpData.session);
      setLoading(false);
      return;
    }

    if (signUpErr) {
      setLoading(false);
      if (isEmailAlreadyRegistered(signUpErr, signUpData)) {
        setPageState("already_has_account");
        return;
      }
      toast({
        title: "Não foi possível criar a conta",
        description: signUpErr.message,
        variant: "destructive",
      });
      return;
    }

    if (signUpData?.user && isEmailAlreadyRegistered(null, signUpData)) {
      setLoading(false);
      setPageState("already_has_account");
      return;
    }

    if (signUpData?.user && !isEmailVerified(signUpData.user)) {
      await resendSignupEmailOtp(trimmedEmail);
      authInfoToast(EMAIL_CONFIRMATION_PENDING_MESSAGE);
      setPhase("otp");
      setLoading(false);
      return;
    }

    if (signUpData?.session) {
      await activateWithSession(signUpData.session);
      setLoading(false);
      return;
    }

    setLoading(false);
    toast({ title: "Não foi possível concluir a ativação", variant: "destructive" });
  }

  async function handleOtpConfirmed(session: Session) {
    setLoading(true);
    await activateWithSession(session);
    setLoading(false);
  }

  if (pageState === "loading") {
    return (
      <main className="flex-1 flex items-center justify-center min-h-[70vh] p-4">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Verificando link de ativação...</p>
        </div>
      </main>
    );
  }

  if (pageState === "already_has_account") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Esta conta já existe</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tokenInfo?.nome ? (
              <>
                Olá, <strong>{tokenInfo.nome}</strong>! Este e-mail já está cadastrado. Faça login
                normalmente na opção <strong>Sou Paciente</strong>.
              </>
            ) : (
              <>
                Este e-mail já está cadastrado. Faça login normalmente na opção{" "}
                <strong>Sou Paciente</strong>.
              </>
            )}
          </p>
          <Button asChild className="w-full rounded-full bg-gradient-brand text-white shadow-glow">
            <Link to="/login?role=patient">Entrar</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (pageState === "token_already_used") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Link já utilizado</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Este link de ativação já foi usado. Se você já concluiu o cadastro, faça login na opção{" "}
            <strong>Sou Paciente</strong>. Caso contrário, peça um novo link à clínica.
          </p>
          <Button asChild className="w-full rounded-full bg-gradient-brand text-white shadow-glow">
            <Link to="/login?role=patient">Entrar</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (pageState === "token_expired") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Link expirado</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Este link de ativação expirou. Entre em contato com a clínica para solicitar um novo link.
          </p>
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to="/login?role=patient">Ir para o Login</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (pageState === "invalid") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[420px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Link de ativação inválido</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Não foi possível validar este link. Verifique se o endereço está completo ou peça um novo
            link à clínica.
          </p>
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link to="/login?role=patient">Ir para o Login</Link>
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
              Olá, <strong>{tokenInfo?.nome}</strong>! Crie sua senha para acessar a agenda da clínica{" "}
              <strong>{tokenInfo?.barbearia_nome}</strong>.
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
                Crie uma senha
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

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs font-medium text-muted-foreground">
                Confirmar senha
              </Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repita a senha"
                showHint={false}
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
