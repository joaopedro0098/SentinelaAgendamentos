import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/features/auth/components/GoogleButton";
import { PASSWORD_MIN_LENGTH, PasswordInput } from "@/features/auth/components/PasswordInput";
import { toast } from "@/hooks/use-toast";
import {
  AUTH_CONFIG_ERROR_MESSAGE,
  EMAIL_CONFIRMATION_PENDING_MESSAGE,
  isEmailNotConfirmedError,
  isInvalidApiKeyError,
} from "@/features/auth/lib/authErrors";
import { authInfoToast } from "@/features/auth/lib/authToast";
import { getEmailSignupStatus } from "@/features/auth/lib/emailSignupStatus";
import { resendSignupEmailOtp } from "@/features/auth/lib/signupEmailOtp";
import { isInvalidLoginCredentials } from "@/features/auth/lib/loginErrors";
import { PageReveal } from "@/components/layout/PageReveal";
import { AppBootSkeleton } from "@/components/layout/AppBootSkeleton";
import {
  getPatientActivationSuccessPath,
  getPostLoginPathForRole,
  type LoginRole,
} from "@/features/auth/lib/postLoginPaths";
import { finishPatientActivation } from "@/features/auth/lib/patientActivationFinish";
import { resolvePatientPostLoginPath } from "@/features/auth/lib/resolvePatientPostLoginPath";
import { cn } from "@/lib/utils";

const EMAIL_NOT_REGISTERED_MESSAGE = "E-mail não cadastrado. Favor realizar cadastro.";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
    .max(72),
});

function showSupabaseConfigError() {
  toast({
    title: "Configuração do servidor",
    description: AUTH_CONFIG_ERROR_MESSAGE,
    variant: "destructive",
  });
}

function loginRoleFromLocation(search: string, stateRole?: unknown): LoginRole {
  const q = new URLSearchParams(search).get("role");
  if (q === "patient") return "patient";
  if (stateRole === "patient") return "patient";
  return "professional";
}

function activationTokenFromSearch(search: string) {
  return new URLSearchParams(search).get("activation_token")?.trim() ?? "";
}

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activationToken = activationTokenFromSearch(location.search);
  const [role, setRole] = useState<LoginRole>(() =>
    loginRoleFromLocation(location.search, (location.state as { role?: LoginRole } | null)?.role),
  );
  const postLoginPath = getPostLoginPathForRole(role, location.state?.from);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);
  const handledSessionRef = useRef(false);

  const googleCallbackUrl = activationToken
    ? `${window.location.origin}/auth/callback?flow=patient-activation&token=${encodeURIComponent(activationToken)}`
    : undefined;

  async function navigatePatientPostLogin(userId: string) {
    setEntering(true);
    const result = await resolvePatientPostLoginPath(userId, location.state?.from);
    if (result.ok) {
      navigate(result.path, { replace: true });
      return true;
    }

    setEntering(false);
    handledSessionRef.current = false;
    toast({
      title: "Não foi possível entrar como paciente",
      description: result.error,
      variant: "destructive",
    });
    return false;
  }

  async function completePatientActivation(userId: string) {
    const result = await finishPatientActivation(activationToken, userId);
    if (!result.ok) {
      toast({
        title: "Falha ao vincular paciente",
        description: result.error,
        variant: "destructive",
      });
      return false;
    }

    toast({ title: "Conta ativada com sucesso!" });
    navigate(getPatientActivationSuccessPath(result.slug), { replace: true });
    return true;
  }

  useEffect(() => {
    if (!session?.user?.id || handledSessionRef.current) return;
    handledSessionRef.current = true;

    void (async () => {
      if (activationToken) {
        setEntering(true);
        const linked = await completePatientActivation(session.user.id);
        if (!linked) setEntering(false);
        return;
      }
      if (role === "patient") {
        handledSessionRef.current = true;
        await navigatePatientPostLogin(session.user.id);
        return;
      }
      navigate(postLoginPath, { replace: true });
    })();
  }, [session, activationToken, navigate, postLoginPath, role]);

  useEffect(() => {
    if (role === "professional") {
      void import("@/features/dashboard/pages/AppLayout");
      void import("@/features/dashboard/pages/DashboardRoutes");
    }
  }, [role]);

  function goToConfirmCode(emailToConfirm: string) {
    navigate("/signup/confirmar-codigo", {
      replace: true,
      state: { email: emailToConfirm },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast({
        title: "Dados inválidos",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const emailToCheck = parsed.data.email;

    const { error } = await supabase.auth.signInWithPassword({
      email: emailToCheck,
      password: parsed.data.password,
    });

    if (error) {
      if (isInvalidApiKeyError(error)) {
        setLoading(false);
        showSupabaseConfigError();
        return;
      }

      if (isEmailNotConfirmedError(error)) {
        setLoading(false);
        await resendSignupEmailOtp(emailToCheck);
        authInfoToast(EMAIL_CONFIRMATION_PENDING_MESSAGE);
        goToConfirmCode(emailToCheck);
        return;
      }

      if (isInvalidLoginCredentials(error.message)) {
        const recheck = await getEmailSignupStatus(emailToCheck);
        setLoading(false);

        if (recheck.status === "api_key_error") {
          showSupabaseConfigError();
          return;
        }
        if (recheck.status === "not_registered") {
          authInfoToast(EMAIL_NOT_REGISTERED_MESSAGE);
          return;
        }
        if (recheck.status === "pending_confirmation") {
          await resendSignupEmailOtp(emailToCheck);
          authInfoToast(EMAIL_CONFIRMATION_PENDING_MESSAGE);
          goToConfirmCode(emailToCheck);
          return;
        }
        if (recheck.status === "registered") {
          authInfoToast("Senha incorreta.");
          return;
        }
      }

      setLoading(false);
      toast({ title: "Falha ao entrar", description: error.message, variant: "destructive" });
      return;
    }

    setLoading(false);

    if (activationToken) {
      handledSessionRef.current = true;
      setEntering(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (userId && (await completePatientActivation(userId))) return;
      setEntering(false);
      return;
    }

    if (role === "patient") {
      handledSessionRef.current = true;
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (userId && (await navigatePatientPostLogin(userId))) return;
      return;
    }

    setEntering(true);
    navigate(postLoginPath, { replace: true });
  }

  if (entering) {
    return <AppBootSkeleton />;
  }

  const isPatient = role === "patient";
  const googleFlow = isPatient ? "patient-login" : "login";

  return (
    <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
      <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
        <PageReveal className="flex flex-col gap-4">
          <div className="text-center sm:text-left">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Entrar</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {activationToken
                ? "Entre com sua conta existente para concluir a ativação como paciente."
                : isPatient
                  ? "Acesse sua conta para agendar e ver seus atendimentos."
                  : "Acesse seu painel de agenda e consultório."}
            </p>
          </div>

          <div
            className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-secondary/30 p-1"
            role="tablist"
            aria-label="Tipo de acesso"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isPatient}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isPatient
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setRole("patient")}
            >
              Sou Paciente
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isPatient}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                !isPatient
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setRole("professional")}
            >
              Sou Profissional
            </button>
          </div>

          <GoogleButton
            label="Entrar com Google"
            authFlow={googleFlow}
            redirectTo={googleCallbackUrl}
            className="h-11 rounded-xl border-border/80 bg-secondary/40 hover:bg-secondary/70 text-foreground"
          />

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border/80" />
            <span>ou</span>
            <div className="flex-1 h-px bg-border/80" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Senha
                </Label>
                <Link
                  to="/recover"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Esqueci a senha
                </Link>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
              disabled={loading}
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground">
            {isPatient ? (
              <>
                Ainda não ativou sua conta?{" "}
                <span className="text-foreground/80">
                  Peça o link de ativação à clínica onde você está cadastrado.
                </span>
              </>
            ) : (
              <>
                Ainda não tem conta?{" "}
                <Link to="/signup" className="text-foreground hover:underline underline-offset-4">
                  Cadastre-se
                </Link>
              </>
            )}
          </p>
        </PageReveal>
      </div>
    </main>
  );
}
