import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH, PasswordInput } from "@/features/auth/components/PasswordInput";
import { authInfoToast } from "@/features/auth/lib/authToast";
import { bootstrapPasswordRecoverySession } from "@/features/auth/lib/passwordReset";
import { AuthBrandHeader } from "@/features/auth/components/AuthBrandHeader";

const PASSWORDS_MISMATCH_MESSAGE = "Senhas não estão iguais.";

const schema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(72),
    confirm: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(72),
  })
  .refine((data) => data.password === data.confirm, {
    message: PASSWORDS_MISMATCH_MESSAGE,
    path: ["confirm"],
  });

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Recuperação de senha — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;

    async function validateLink() {
      const result = await bootstrapPasswordRecoverySession();
      if (!active) return;

      if (result === "ready") {
        setReady(true);
        return;
      }

      if (result === "invalid") {
        setLinkError("Link inválido ou expirado. Solicite um novo e-mail de recuperação.");
        return;
      }

      timeoutId = window.setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session) {
          setReady(true);
          return;
        }
        setLinkError("Link inválido ou expirado. Solicite um novo e-mail de recuperação.");
      }, 8000);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setLinkError(null);
      }
    });

    void validateLink();

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirm) {
      authInfoToast(PASSWORDS_MISMATCH_MESSAGE);
      return;
    }

    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      const mismatch = parsed.error.issues.some((issue) => issue.message === PASSWORDS_MISMATCH_MESSAGE);
      if (mismatch) {
        authInfoToast(PASSWORDS_MISMATCH_MESSAGE);
        return;
      }
      authInfoToast(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      setLoading(false);
      authInfoToast(error.message);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    navigate("/reset-password/success", { replace: true });
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16 bg-background">
      <div className="w-full max-w-[420px] rounded-2xl border border-[hsl(var(--brand-green)/0.2)] bg-white p-6 sm:p-8 shadow-soft">
        <AuthBrandHeader className="mb-6" />
        <div className="mb-2 text-center">
          <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Recuperação de senha
          </h1>
        </div>

        {linkError ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{linkError}</p>
            <Button
              asChild
              className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
            >
              <Link to="/recover">Solicitar novo link</Link>
            </Button>
          </div>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground text-center">Validando link…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p1" className="text-xs font-medium text-muted-foreground">
                Nova senha
              </Label>
              <PasswordInput
                id="p1"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 rounded-xl border-border/80 bg-white focus-visible:ring-[hsl(var(--brand-green)/0.45)]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p2" className="text-xs font-medium text-muted-foreground">
                Confirmar senha
              </Label>
              <PasswordInput
                id="p2"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                showHint={false}
                className="h-11 rounded-xl border-border/80 bg-white focus-visible:ring-[hsl(var(--brand-green)/0.45)]"
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-[11px] leading-tight text-destructive pl-0.5">{PASSWORDS_MISMATCH_MESSAGE}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
              disabled={loading}
            >
              {loading ? "Salvando…" : "Confirmar"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
