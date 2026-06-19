import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { authInfoToast } from "@/features/auth/lib/authToast";
import { resendSignupEmailOtp, SIGNUP_OTP_LENGTH, verifySignupEmailOtp } from "@/features/auth/lib/signupEmailOtp";
import type { Session } from "@supabase/supabase-js";

type Props = {
  email: string;
  busy?: boolean;
  onConfirmed: (session: Session) => void | Promise<void>;
  onBack?: () => void;
};

export function SignupEmailOtpForm({ email, busy = false, onConfirmed, onBack }: Props) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== SIGNUP_OTP_LENGTH) {
      authInfoToast(`Digite o código de ${SIGNUP_OTP_LENGTH} dígitos enviado ao seu e-mail.`);
      return;
    }

    setSubmitting(true);
    const { data, error } = await verifySignupEmailOtp(email, token);
    setSubmitting(false);

    if (error || !data.session) {
      toast({
        title: "Código inválido ou expirado",
        description: "Confira o código e tente novamente, ou peça um novo.",
        variant: "destructive",
      });
      return;
    }

    await onConfirmed(data.session);
  }

  async function handleResend() {
    setResending(true);
    const { error } = await resendSignupEmailOtp(email);
    setResending(false);
    if (error) {
      toast({ title: "Não foi possível reenviar", description: error.message, variant: "destructive" });
      return;
    }
    authInfoToast("Enviamos um novo código para o seu e-mail.");
  }

  const disabled = busy || submitting || resending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="signup-otp" className="text-xs font-medium text-muted-foreground">
          Código de verificação
        </Label>
        <Input
          id="signup-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={SIGNUP_OTP_LENGTH}
          placeholder={"0".repeat(SIGNUP_OTP_LENGTH)}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, SIGNUP_OTP_LENGTH))}
          required
          disabled={disabled}
          className="h-11 rounded-xl border-border/80 bg-secondary/30 text-center text-lg tracking-[0.35em] font-semibold focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
        />
        <p className="text-[11px] text-muted-foreground text-center">
          Enviamos um código de {SIGNUP_OTP_LENGTH} dígitos para{" "}
          <span className="text-foreground">{email}</span>
        </p>
      </div>

      <Button
        type="submit"
        className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
        disabled={disabled || code.length !== SIGNUP_OTP_LENGTH}
      >
        {submitting ? "Verificando…" : "Confirmar e continuar"}
      </Button>

      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          onClick={() => void handleResend()}
          disabled={disabled}
        >
          {resending ? "Reenviando…" : "Reenviar código"}
        </button>
        {onBack && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={onBack}
            disabled={disabled}
          >
            Voltar
          </button>
        )}
      </div>
    </form>
  );
}
