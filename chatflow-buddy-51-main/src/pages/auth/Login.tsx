import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoogleButton } from "@/components/GoogleButton";
import { toast } from "@/hooks/use-toast";

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = "Entrar — BarberChat"; }, []);
  useEffect(() => { if (session) navigate("/app", { replace: true }); }, [session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast({ title: "Dados inválidos", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setLoading(false);
    if (error) {
      toast({ title: "Falha ao entrar", description: error.message, variant: "destructive" });
      return;
    }
    navigate("/app", { replace: true });
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-chat-app-bg">
      <Link to="/" className="flex items-center gap-2 mb-6">
        <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
          <Scissors className="h-5 w-5" />
        </div>
        <span className="font-semibold text-lg">BarberChat</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>Acesse o painel da sua barbearia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoogleButton label="Entrar com Google" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> ou <div className="flex-1 h-px bg-border" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link to="/recover" className="text-xs text-primary hover:underline">Esqueci a senha</Link>
              </div>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
          <p className="text-sm text-center text-muted-foreground">
            Ainda não tem conta? <Link to="/signup" className="text-primary hover:underline">Cadastrar</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
