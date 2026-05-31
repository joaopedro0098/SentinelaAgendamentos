import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/features/auth/components/GoogleButton";
import { PASSWORD_MIN_LENGTH, PasswordInput } from "@/features/auth/components/PasswordInput";
import { toast } from "@/hooks/use-toast";
import { checkEmailRegistered } from "@/features/auth/lib/checkEmailRegistered";
import { AUTH_CONFIG_ERROR_MESSAGE, EMAIL_CONFIRMATION_PENDING_MESSAGE, isEmailNotConfirmedError, isInvalidApiKeyError } from "@/features/auth/lib/authErrors";
import { authInfoToast } from "@/features/auth/lib/authToast";
import { getEmailSignupStatus, resendSignupConfirmation } from "@/features/auth/lib/emailSignupStatus";
import { isInvalidLoginCredentials } from "@/features/auth/lib/loginErrors";
import { PageReveal } from "@/components/layout/PageReveal";
import { AuthBrandHeader } from "@/features/auth/components/AuthBrandHeader";

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

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Entrar — Sentinela Agendamentos";
  }, []);
  useEffect(() => {
    if (session) navigate("/app", { replace: true });
  }, [session, navigate]);

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

    const emailCheck = await checkEmailRegistered(emailToCheck);

    if (emailCheck.status === "api_key_error") {
      setLoading(false);
      showSupabaseConfigError();
      return;
    }

    if (emailCheck.status === "not_registered") {
      setLoading(false);
      authInfoToast(EMAIL_NOT_REGISTERED_MESSAGE);
      return;
    }

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
        await resendSignupConfirmation(emailToCheck);
        authInfoToast(EMAIL_CONFIRMATION_PENDING_MESSAGE);
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
          await resendSignupConfirmation(emailToCheck);
          authInfoToast(EMAIL_CONFIRMATION_PENDING_MESSAGE);
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
    navigate("/app", { replace: true });
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
      <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
        <PageReveal className="flex flex-col gap-4">
          <AuthBrandHeader className="mb-1" />
          <div className="text-center sm:text-left">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Entrar</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Acesse o painel da sua barbearia.</p>
          </div>

          <GoogleButton
            label="Entrar com Google"
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
            Ainda não tem conta?{" "}
            <Link to="/signup" className="text-foreground hover:underline underline-offset-4">
              Cadastre-se
            </Link>
          </p>
        </PageReveal>
      </div>
    </main>
  );
}
