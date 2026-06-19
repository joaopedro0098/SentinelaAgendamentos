import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { AuthBrandHeader } from "@/features/auth/components/AuthBrandHeader";
import { SignupEmailOtpForm } from "@/features/auth/components/SignupEmailOtpForm";
import { PageReveal } from "@/components/layout/PageReveal";
import { completeSignupSession } from "@/features/auth/lib/completeSignupSession";
import { getBarberPostLoginPath } from "@/lib/pwaInstall";

type LocationState = {
  email?: string;
  shopName?: string;
};

export default function SignupConfirmEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;
  const email = state.email?.trim() ?? "";

  async function handleConfirmed(session: Session) {
    const { needsFace } = await completeSignupSession(session, {
      email: session.user.email ?? email,
      shopName: state.shopName,
    });

    if (needsFace) {
      navigate("/auth/complete-verification", { replace: true });
      return;
    }
    navigate(getBarberPostLoginPath(), { replace: true });
  }

  if (!email) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft text-center space-y-4">
          <p className="text-sm text-muted-foreground">Informe seu e-mail no cadastro ou no login para receber o código.</p>
          <Link to="/signup" className="text-sm text-foreground hover:underline underline-offset-4">
            Ir para cadastro
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
      <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
        <PageReveal className="flex flex-col gap-4">
          <AuthBrandHeader className="mb-1" />
          <div className="text-center sm:text-left">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Confirme seu e-mail</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Digite o código que enviamos para finalizar seu cadastro.
            </p>
          </div>
          <SignupEmailOtpForm email={email} onConfirmed={handleConfirmed} />
          <p className="text-sm text-center text-muted-foreground">
            Já confirmou?{" "}
            <Link to="/login" className="text-foreground hover:underline underline-offset-4">
              Entrar
            </Link>
          </p>
        </PageReveal>
      </div>
    </main>
  );
}
