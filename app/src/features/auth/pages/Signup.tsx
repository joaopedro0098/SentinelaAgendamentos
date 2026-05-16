import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/features/auth/components/GoogleButton";
import { PASSWORD_MIN_LENGTH, PasswordInput } from "@/features/auth/components/PasswordInput";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/features/landing/components/Navbar";

const schema = z.object({
  display_name: z.string().trim().min(2, "Nome muito curto").max(80),
  shop_name: z.string().trim().min(2, "Nome da empresa muito curto").max(80),
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`)
    .max(72),
});

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 40) || "barbearia"
  );
}

export default function Signup() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Teste grátis 14 dias — Sentinela Agendamentos";
  }, []);
  useEffect(() => {
    if (session) navigate("/app", { replace: true });
  }, [session, navigate]);

  async function createBarbershopForUser(userId: string, name: string) {
    let slug = slugify(name);
    for (let i = 0; i < 5; i++) {
      const trySlug = i === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("barbershops").insert({
        owner_id: userId,
        slug: trySlug,
        display_name: name,
      });
      if (!error) {
        slug = trySlug;
        break;
      }
      if (!error || !`${error.message}`.includes("duplicate")) break;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({
      display_name: displayName,
      shop_name: shopName,
      email,
      password,
    });
    if (!parsed.success) {
      toast({
        title: "Dados inválidos",
        description: parsed.error.issues[0].message,
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: {
          display_name: parsed.data.display_name,
          shop_name: parsed.data.shop_name,
        },
      },
    });
    if (error) {
      setLoading(false);
      toast({ title: "Falha ao cadastrar", description: error.message, variant: "destructive" });
      return;
    }

    if (data.session && data.user) {
      await createBarbershopForUser(data.user.id, parsed.data.shop_name);
      navigate("/app", { replace: true });
    } else {
      toast({
        title: "Confira seu e-mail",
        description: "Enviamos um link para confirmar sua conta.",
      });
      navigate("/login", { replace: true });
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="w-full max-w-[400px] glass rounded-2xl border border-border/60 p-6 sm:p-8 shadow-soft">
          <div className="mb-6 text-center sm:text-left">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Teste grátis por 14 dias</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Crie sua conta e comece a atender pelo chat. Sem cartão neste período.
            </p>
          </div>

          <div className="space-y-4">
            <GoogleButton
              label="Cadastrar com Google"
              className="h-11 rounded-xl border-border/80 bg-secondary/40 hover:bg-secondary/70 text-foreground"
            />

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border/80" />
              <span>ou</span>
              <div className="flex-1 h-px bg-border/80" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="dn" className="text-xs font-medium text-muted-foreground">
                  Seu nome
                </Label>
                <Input
                  id="dn"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sn" className="text-xs font-medium text-muted-foreground">
                  Nome da sua empresa
                </Label>
                <Input
                  id="sn"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
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
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Senha
                </Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-secondary/30 focus-visible:ring-[hsl(var(--brand-violet)/0.5)]"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
                disabled={loading}
              >
                {loading ? "Criando…" : "Criar conta"}
              </Button>
            </form>

            <p className="text-sm text-center text-muted-foreground pt-1">
              Já tem conta?{" "}
              <Link to="/login" className="text-foreground hover:underline underline-offset-4">
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
