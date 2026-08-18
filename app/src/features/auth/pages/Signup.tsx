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
import { checkProfessionalAccount } from "@/features/auth/lib/professionalAccount";
import { provisionProfessionalAccount } from "@/features/auth/lib/provisionProfessionalAccount";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";
import type { Session } from "@supabase/supabase-js";
import { isDesktopForFaceHandoff } from "@/features/auth/face-verification/isDesktopForFaceHandoff";

const FaceVerificationFlow = lazy(() =>
  import("@/features/auth/face-verification/FaceVerificationFlow").then((m) => ({
    default: m.FaceVerificationFlow,
  })),
);

const FaceHandoffDesktopStep = lazy(() =>
  import("@/features/auth/face-verification/FaceHandoffDesktopStep").then((m) => ({
    default: m.FaceHandoffDesktopStep,
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

const upgradeSchema = z.object({
  display_name: z.string().trim().min(2, "Nome muito curto").max(80),
  shop_name: z.string().trim().min(2, "Nome da empresa muito curto").max(80),
});

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
  const [usePcFaceVerification, setUsePcFaceVerification] = useState(false);
  const [submittingAccount, setSubmittingAccount] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpShopName, setOtpShopName] = useState("");
  const pendingSignupRef = useRef<z.infer<typeof schema> | null>(null);
  const [upgradeMode, setUpgradeMode] = useState(false);
  const [blockedProfessional, setBlockedProfessional] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(true);

  useEffect(() => {
    let active = true;

    async function detectDualProfile() {
      if (!session?.user) {
        if (active) {
          setUpgradeMode(false);
          setBlockedProfessional(false);
          setCheckingAccount(false);
        }
        return;
      }

      if (!isEmailVerified(session.user)) {
        if (active) {
          setUpgradeMode(false);
          setBlockedProfessional(false);
          setCheckingAccount(false);
        }
        return;
      }

      const account = await checkProfessionalAccount();
      if (!active) return;

      if (account.status === "professional") {
        setBlockedProfessional(true);
        setUpgradeMode(false);
      } else if (account.status === "patient_only") {
        setUpgradeMode(true);
        setBlockedProfessional(false);
        setEmail(session.user.email ?? "");
        const meta = session.user.user_metadata ?? {};
        setDisplayName(
          String(meta.display_name ?? meta.full_name ?? meta.name ?? "").trim(),
        );
      } else {
        setUpgradeMode(false);
        setBlockedProfessional(false);
      }
      setCheckingAccount(false);
    }

    void detectDualProfile();
    return () => {
      active = false;
    };
  }, [session?.user?.id, session?.user?.email, session?.user?.email_confirmed_at]);

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

  async function completeProfessionalUpgrade(
    parsed: z.infer<typeof upgradeSchema>,
    verification: FacialVerificationResult,
  ) {
    if (!session?.user) {
      toast({ title: "Sessão expirada", description: "Faça login novamente.", variant: "destructive" });
      return;
    }

    setSubmittingAccount(true);
    setLoading(true);

    const provision = await provisionProfessionalAccount(parsed.shop_name, parsed.display_name);
    if ("error" in provision && provision.error) {
      setLoading(false);
      setSubmittingAccount(false);
      setShowFaceVerification(false);
      pendingSignupRef.current = null;
      toast({
        title: provision.code === "professional_account_exists" ? "Conta profissional existente" : "Não foi possível criar a conta",
        description: provision.error,
        variant: "destructive",
      });
      return;
    }

    savePendingFaceEmbedding(verification.embedding, session.user.email ?? undefined);
    const { needsFace } = await completeSignupSession(session, {
      email: session.user.email ?? "",
      shopName: parsed.shop_name,
    });

    setShowFaceVerification(false);
    setLoading(false);
    setSubmittingAccount(false);
    pendingSignupRef.current = null;
    navigate(needsFace ? "/auth/complete-verification" : getBarberPostLoginPath(), { replace: true });
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

    if (upgradeMode) {
      const parsed = upgradeSchema.safeParse({ display_name: displayName, shop_name: shopName });
      if (!parsed.success) {
        toast({
          title: "Dados inválidos",
          description: parsed.error.issues[0].message,
          variant: "destructive",
        });
        return;
      }
      pendingSignupRef.current = null;
      setUsePcFaceVerification(false);
      setShowFaceVerification(true);
      return;
    }

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
    setUsePcFaceVerification(false);
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

  const showDesktopHandoff = showFaceVerification && isDesktopForFaceHandoff() && !usePcFaceVerification;
  const showPcFaceFlow = showFaceVerification && (!isDesktopForFaceHandoff() || usePcFaceVerification);

  if (checkingAccount) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center text-sm text-muted-foreground">
          Verificando sua conta…
        </div>
      </main>
    );
  }

  if (blockedProfessional) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft space-y-4 text-center">
          <h1 className="font-display text-xl font-semibold">Conta profissional já existente</h1>
          <p className="text-sm text-muted-foreground">
            Este login já possui acesso ao painel profissional. Use o painel para gerenciar sua agenda.
          </p>
          <Button asChild className="w-full rounded-full">
            <Link to="/app/agendamentos">Ir para o painel</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        {showDesktopHandoff ? (
          <FaceHandoffDesktopStep
            open
            busy={submittingAccount}
            busyMessage="Criando sua conta…"
            onClose={() => {
              if (submittingAccount) return;
              setShowFaceVerification(false);
              setUsePcFaceVerification(false);
              pendingSignupRef.current = null;
            }}
            onContinueOnPc={() => setUsePcFaceVerification(true)}
            onVerified={(result) => {
              if (upgradeMode) {
                const parsed = upgradeSchema.safeParse({ display_name: displayName, shop_name: shopName });
                if (parsed.success) void completeProfessionalUpgrade(parsed.data, result);
                return;
              }
              const pending = pendingSignupRef.current;
              if (pending) void completeSignup(pending, result);
            }}
          />
        ) : null}
        {showPcFaceFlow ? (
          <FaceVerificationFlow
            open
            busy={submittingAccount}
            busyMessage="Criando sua conta…"
            onClose={() => {
              if (submittingAccount) return;
              setShowFaceVerification(false);
              setUsePcFaceVerification(false);
              pendingSignupRef.current = null;
            }}
            onVerified={(result) => {
              if (upgradeMode) {
                const parsed = upgradeSchema.safeParse({ display_name: displayName, shop_name: shopName });
                if (parsed.success) void completeProfessionalUpgrade(parsed.data, result);
                return;
              }
              const pending = pendingSignupRef.current;
              if (pending) void completeSignup(pending, result);
            }}
          />
        ) : null}
      </Suspense>
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] max-h-[calc(100vh-7rem)] overflow-y-auto glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
          <PageReveal className="flex flex-col gap-4">
            <div className="text-center sm:text-left">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {upgradeMode ? "Criar conta profissional" : "Teste grátis por 14 dias"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {upgradeMode
                  ? "Seu e-mail já está verificado. Informe os dados da clínica e conclua com reconhecimento facial."
                  : "Crie sua conta e comece a receber agendamentos online hoje mesmo. Não pedimos cartão."}
              </p>
            </div>

            {!upgradeMode && (
              <>
                <GoogleButton
                  label="Cadastrar com Google"
                  authFlow="signup"
                  className="h-11 rounded-xl border-border/80 bg-secondary/40 hover:bg-secondary/70 text-foreground"
                />

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex-1 h-px bg-border/80" />
                  <span>ou</span>
                  <div className="flex-1 h-px bg-border/80" />
                </div>
              </>
            )}

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
              {!upgradeMode && (
                <>
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
                </>
              )}
              {upgradeMode && email && (
                <p className="text-xs text-muted-foreground">
                  Conta vinculada: <span className="text-foreground font-medium">{email}</span>
                </p>
              )}
              <Button
                type="submit"
                className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
                disabled={loading}
              >
                {loading ? "Processando…" : upgradeMode ? "Continuar para verificação facial" : "Criar conta"}
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
