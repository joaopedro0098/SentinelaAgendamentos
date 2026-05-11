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
  display_name: z.string().trim().min(2, "Nome muito curto").max(80),
  shop_name: z.string().trim().min(2, "Nome da barbearia muito curto").max(80),
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "").slice(0, 40) || "barbearia";
}

export default function Signup() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = "Criar conta — BarberChat"; }, []);
  useEffect(() => { if (session) navigate("/app", { replace: true }); }, [session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ display_name: displayName, shop_name: shopName, email, password });
    if (!parsed.success) {
      toast({ title: "Dados inválidos", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { display_name: parsed.data.display_name, shop_name: parsed.data.shop_name },
      },
    });
    if (error) {
      setLoading(false);
      toast({ title: "Falha ao cadastrar", description: error.message, variant: "destructive" });
      return;
    }

    // Se já temos sessão (auto-confirm desligado normalmente fica null), tentamos criar barbearia
    if (data.session && data.user) {
      await createBarbershopForUser(data.user.id, parsed.data.shop_name);
      navigate("/app", { replace: true });
    } else {
      toast({ title: "Confira seu e-mail", description: "Enviamos um link para confirmar sua conta." });
      navigate("/login", { replace: true });
    }
    setLoading(false);
  }

  async function createBarbershopForUser(userId: string, name: string) {
    let slug = slugify(name);
    for (let i = 0; i < 5; i++) {
      const trySlug = i === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("barbershops").insert({
        owner_id: userId,
        slug: trySlug,
        display_name: name,
      });
      if (!error) { slug = trySlug; break; }
      if (!error || !`${error.message}`.includes("duplicate")) break;
    }
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
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>Comece a atender pelo chat em minutos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <GoogleButton label="Cadastrar com Google" />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" /> ou <div className="flex-1 h-px bg-border" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dn">Seu nome</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sn">Nome da barbearia</Label>
              <Input id="sn" value={shopName} onChange={(e) => setShopName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Criando…" : "Criar conta"}
            </Button>
          </form>
          <p className="text-sm text-center text-muted-foreground">
            Já tem conta? <Link to="/login" className="text-primary hover:underline">Entrar</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
