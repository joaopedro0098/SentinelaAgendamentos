import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH, PasswordInput } from "@/features/auth/components/PasswordInput";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/features/landing/components/Navbar";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = "Nova senha — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      toast({
        title: "Senha curta",
        description: `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas diferentes", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Senha atualizada!" });
    navigate("/app", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
          <div className="mb-6 text-center sm:text-left">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Definir nova senha</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Crie uma senha forte para sua conta.</p>
          </div>

          {!ready ? (
            <p className="text-sm text-muted-foreground text-center">Validando link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="p1" className="text-xs font-medium text-muted-foreground">
                  Nova senha
                </Label>
                <PasswordInput
                  id="p1"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p2" className="text-xs font-medium text-muted-foreground">
                  Confirmar senha
                </Label>
                <PasswordInput
                  id="p2"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                {loading ? "Salvando…" : "Salvar nova senha"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
