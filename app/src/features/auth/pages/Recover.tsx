import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { passwordResetRedirectUrl } from "@/features/auth/lib/passwordReset";

export default function Recover() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirectUrl(),
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 pt-24 sm:pt-28 pb-12 sm:pb-16 min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-lg mx-auto text-center space-y-6 sm:space-y-8">
          <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-secondary/60 border border-border/60">
            <Mail className="h-7 w-7 sm:h-8 sm:w-8 text-[hsl(var(--brand-green))]" aria-hidden />
          </div>

          <div className="space-y-3 sm:space-y-4 px-1">
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
              Verifique seu email e Spam
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
              Se este e-mail existir, você receberá um link em instantes.
            </p>
            <p className="text-sm sm:text-base leading-relaxed max-w-md mx-auto rounded-xl border border-red-200/80 bg-red-50/60 px-4 py-3 text-left sm:text-center">
              <span className="font-semibold text-red-600">Atenção:</span>{" "}
              Se o seu e-mail reconhecer a mensagem como não segura, você precisará clicar no botão{" "}
              <strong className="font-semibold text-foreground">confirmando</strong> que é segura para disponibilizar o
              link.
            </p>
          </div>

          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto min-w-[200px] h-11 sm:h-12 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow px-8"
          >
            <Link to="/login">Voltar para Login</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
      <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
        <div className="mb-6 text-center sm:text-left">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Recuperar senha</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Enviaremos um link para redefinir sua senha.</p>
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
              className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-green)/0.45)]"
            />
          </div>
          <Button
            type="submit"
            className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
            disabled={loading}
          >
            {loading ? "Enviando…" : "Enviar link"}
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full h-11 rounded-full border-border/80 bg-transparent hover:bg-secondary/40"
          >
            <Link to="/login">Voltar para Login</Link>
          </Button>
        </form>
      </div>
    </main>
  );
}
