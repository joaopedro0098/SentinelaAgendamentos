import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

export default function Recover() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { document.title = "Recuperar senha — BarberChat"; }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setSent(true);
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
          <CardTitle>Recuperar senha</CardTitle>
          <CardDescription>Enviaremos um link para redefinir sua senha.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-3 text-center">
              <p className="text-sm">Se este e-mail existir, você receberá um link em instantes.</p>
              <Button asChild variant="outline" className="w-full"><Link to="/login">Voltar ao login</Link></Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? "Enviando…" : "Enviar link"}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                <Link to="/login" className="text-primary hover:underline">Voltar ao login</Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
