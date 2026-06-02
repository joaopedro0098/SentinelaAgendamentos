import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthBrandHeader } from "@/features/auth/components/AuthBrandHeader";

export default function VerifyEmailSignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 sm:px-6 pt-24 sm:pt-28 pb-12 sm:pb-16 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-lg mx-auto text-center space-y-6 sm:space-y-8">
        <AuthBrandHeader />

        <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-secondary/60 border border-border/60">
          <Mail className="h-7 w-7 sm:h-8 sm:w-8 text-[hsl(var(--brand-green))]" aria-hidden />
        </div>

        <div className="space-y-3 sm:space-y-4 px-1">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Verifique seu email e spam
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
            E clique em confirmar para finalizar seu cadastro
          </p>
        </div>

        <Button
          asChild
          size="lg"
          className="w-full sm:w-auto min-w-[200px] h-11 sm:h-12 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow px-8"
        >
          <Link to="/login">Ir para login</Link>
        </Button>
      </div>
    </main>
  );
}
