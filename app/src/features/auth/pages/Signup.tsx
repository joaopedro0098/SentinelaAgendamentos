import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/features/auth/components/GoogleButton";
import { PASSWORD_MIN_LENGTH, PasswordInput } from "@/features/auth/components/PasswordInput";
import { SignupEmailOtpForm } from "@/features/auth/components/SignupEmailOtpForm";
import { toast } from "@/hooks/use-toast";
import {
  AUTH_CONFIG_ERROR_MESSAGE,
  isEmailAlreadyRegistered,
  isInvalidApiKeyError,
  toSignupErrorDescription,
} from "@/features/auth/lib/authErrors";
import { authInfoToast } from "@/features/auth/lib/authToast";
import { PageReveal } from "@/components/layout/PageReveal";
import { getBarberPostLoginPath } from "@/lib/pwaInstall";
import { savePendingFaceEmbedding } from "@/features/auth/face-verification/pendingFaceStorage";
import { getEmailSignupStatus } from "@/features/auth/lib/emailSignupStatus";
import { resendSignupEmailOtp } from "@/features/auth/lib/signupEmailOtp";
import { completeSignupSession } from "@/features/auth/lib/completeSignupSession";
import { isEmailVerified } from "@/features/auth/lib/signupCompletion";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";
import type { Session } from "@supabase/supabase-js";

const FaceVerificationFlow = lazy(() =>
  import("@/features/auth/face-verification/FaceVerificationFlow").then((m) => ({
    default: m.FaceVerificationFlow,
  })),
);

const schema = z
  .object({
    display_name: z.string().trim().min(2, "Nome muito curto").max(80),
    shop_name: z.string().trim().min(2, "Nome da empresa muito curto").max(80),
    email: z.string().trim().email("E-mail inválido").max(255),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(72),
    confirm_password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(72),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Senhas não estão iguais.",
    path: ["confirm_password"],
  });

const PASSWORDS_MISMATCH_MESSAGE = "Senhas não estão iguais.";

type SignupPhase = "form" | "otp";

export default function Signup() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<SignupPhase>("form");
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpShopName, setOtpShopName] = useState("");
  const pendingSignupRef = useRef<z.infer<typeof schema> | null>(null);

  useEffect(() => {
    if (session && isEmailVerified(session.user)) {
      navigate(getBarberPostLoginPath(), { replace: true });
    }
  }, [session, navigate]);

  function beginOtpStep(parsed: z.infer<typeof schema>, verification: FacialVerificationResult) {
    savePendingFaceEmbedding(verification.embedding, parsed.email);
    setOtpEmail(parsed.email);
    setOtpShopName(parsed.shop_name);
    setShowFaceVerification(false);
    setPhase("otp");
    setLoading(false);
    setSubmittingAccount(false);
    pendingSignupRef.current = null;
  }

  async function completeSignup(parsed: z.infer<typeof schema>, verification: FacialVerificationResult) {
    setSubmittingAccount(true);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
      options: {
        data: {
          display_name: parsed.display_name,
          shop_name: parsed.shop_name,
        },
      },
    });

    if (isEmailAlreadyRegistered(error, data)) {
      setSubmittingAccount(false);
      setShowFaceVerification(false);
      const status = await getEmailSignupStatus(parsed.email);
      if (status.status === "pending_confirmation") {
        savePendingFaceEmbedding(verification.embedding, parsed.email);
        await resendSignupEmailOtp(parsed.email);
        beginOtpStep(parsed, verification);
        authInfoToast("Enviamos um código para o seu e-mail. Digite-o abaixo para finalizar.");
        return;
      }
      setLoading(false);
      authInfoToast("E-mail já cadastrado. Faça o login normalmente.");
      pendingSignupRef.current = null;
      return;
    }

    if (error) {
      setLoading(false);
      setSubmittingAccount(false);
      setShowFaceVerification(false);
      pendingSignupRef.current = null;
      if (isInvalidApiKeyError(error)) {
        toast({ title: "Configuração do servidor", description: AUTH_CONFIG_ERROR_MESSAGE, variant: "destructive" });
        return;
      }
      const status = await getEmailSignupStatus(parsed.email);
      if (status.status === "pending_confirmation") {
        savePendingFaceEmbedding(verification.embedding, parsed.email);
        await resendSignupEmailOtp(parsed.email);
        beginOtpStep(parsed, verification);
        return;
      }
      toast({ title: "Falha ao cadastrar", description: toSignupErrorDescription(error), variant: "destructive" });
      return;
    }

    if (data.session && data.user && isEmailVerified(data.user)) {
      savePendingFaceEmbedding(verification.embedding, parsed.email);
      const { needsFace } = await completeSignupSession(data.session, {
        email: parsed.email,
        shopName: parsed.shop_name,
      });
      setShowFaceVerification(false);
      setLoading(false);
      setSubmittingAccount(false);
      pendingSignupRef.current = null;
      navigate(needsFace ? "/auth/complete-verification" : getBarberPostLoginPath(), { replace: true });
      return;
    }

    beginOtpStep(parsed, verification);
  }

  async function handleOtpConfirmed(confirmedSession: Session) {
    setLoading(true);
    const { needsFace } = await completeSignupSession(confirmedSession, {
      email: otpEmail,
      shopName: otpShopName,
    });
    setLoading(false);
    navigate(needsFace ? "/auth/complete-verification" : getBarberPostLoginPath(), { replace: true });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      authInfoToast(PASSWORDS_MISMATCH_MESSAGE);
      return;
    }

    const parsed = schema.safeParse({
      display_name: displayName,
      shop_name: shopName,
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
    pendingSignupRef.current = parsed.data;
    setShowFaceVerification(true);
  }

  if (phase === "otp") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
          <PageReveal className="flex flex-col gap-4">
            <div className="text-center sm:text-left">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Quase lá!</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Digite o código enviado ao seu e-mail para finalizar o cadastro.
              </p>
            </div>
            <SignupEmailOtpForm
              email={otpEmail}
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
    <>
      <Suspense fallback={null}>
        <FaceVerificationFlow
          open={showFaceVerification}
          busy={submittingAccount}
          busyMessage="Criando sua conta…"
          onClose={() => {
            if (submittingAccount) return;
            setShowFaceVerification(false);
            pendingSignupRef.current = null;
          }}
          onVerified={(result) => {
            const pending = pendingSignupRef.current;
            if (pending) void completeSignup(pending, result);
          }}
        />
      </Suspense>
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] max-h-[calc(100vh-7rem)] overflow-y-auto glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
          <PageReveal className="flex flex-col gap-4">
            <div className="text-center sm:text-left">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Teste grátis por 14 dias</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Crie sua conta e comece a receber agendamentos online. Sem cartão neste período.
              </p>
            </div>

            <GoogleButton
              label="Cadastrar com Google"
              authFlow="signup"
              className="h-11 rounded-xl border-border/80 bg-secondary/40 hover:bg-secondary/70 text-foreground"
            />
            <p className="text-[11px] text-center text-muted-foreground">
              Após o Google, faremos uma verificação facial rápida (poucos segundos).
            </p>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border/80" />
              <span>ou</span>
              <div className="flex-1 h-px bg-border/80" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="dn" className="text-xs font-medium text-muted-foreground">
                  Seu nome
                </Label>
                <Input
                  id="dn"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sn" className="text-xs font-medium text-muted-foreground">
                  Nome da sua empresa
                </Label>
                <Input
                  id="sn"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
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
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Senha
                </Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm_password" className="text-xs font-medium text-muted-foreground">
                  Confirmar senha
                </Label>
                <PasswordInput
                  id="confirm_password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  showHint={false}
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
                disabled={loading}
              >
                {loading ? "Criando…" : "Criar conta"}
              </Button>
            </form>

            <p className="text-sm text-center text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="text-foreground hover:underline underline-offset-4">
                Entrar
              </Link>
            </p>
          </PageReveal>
        </div>
      </main>
    </>
  );
}
