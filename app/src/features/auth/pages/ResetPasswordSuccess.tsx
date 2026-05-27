import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ResetPasswordSuccessPage() {
  useEffect(() => {
    document.title = "Senha alterada — Sentinela Agendamentos";
  }, []);

  return (
    <main className="relative flex-1 flex items-center justify-center px-4 sm:px-6 pt-24 sm:pt-28 pb-12 sm:pb-16 min-h-[calc(100vh-4rem)]">
      <Link
        to="/"
        className="absolute top-24 sm:top-28 right-4 sm:right-6 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-white text-muted-foreground hover:text-foreground hover:border-[hsl(var(--brand-green)/0.4)] transition-colors shadow-sm"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" aria-hidden />
      </Link>

      <div className="w-full max-w-lg mx-auto text-center space-y-6 sm:space-y-8">
        <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[hsl(var(--brand-green)/0.12)] border border-[hsl(var(--brand-green)/0.25)]">
          <CheckCircle2 className="h-7 w-7 sm:h-8 sm:w-8 text-[hsl(var(--brand-green))]" aria-hidden />
        </div>

        <div className="space-y-3 sm:space-y-4 px-1">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            Senha alterada com sucesso
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
            Você pode fazer o login normalmente.
          </p>
        </div>

        <Button
          asChild
          size="lg"
          className="w-full sm:w-auto min-w-[200px] h-11 sm:h-12 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow px-8"
        >
          <Link to="/login">Fazer login</Link>
        </Button>
      </div>
    </main>
  );
}
