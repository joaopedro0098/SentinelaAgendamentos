import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type ShopRow = {
  id: string;
  slug: string;
  display_name: string;
  owner_id: string | null;
  created_at: string;
};

export default function AdminPanel() {
  const [globalWebhook, setGlobalWebhook] = useState("");
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => {
    document.title = "Admin — BarberChat";
  }, []);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);

    const [platRes, shopsRes] = await Promise.all([
      supabase.from("platform_settings").select("n8n_webhook_url").eq("id", 1).maybeSingle(),
      supabase
        .from("barbershops")
        .select("id, slug, display_name, owner_id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (platRes.error) {
      toast({
        title: "Erro ao carregar webhook global",
        description: platRes.error.message,
        variant: "destructive",
      });
    } else {
      setGlobalWebhook(platRes.data?.n8n_webhook_url ?? "");
    }

    if (shopsRes.error) {
      toast({
        title: "Erro ao carregar barbearias",
        description: shopsRes.error.message,
        variant: "destructive",
      });
    } else {
      setShops((shopsRes.data ?? []) as ShopRow[]);
    }

    setLoading(false);
  }

  async function saveGlobalWebhook(e: React.FormEvent) {
    e.preventDefault();
    setSavingWebhook(true);
    const trimmed = globalWebhook.trim();
    const { error } = await supabase
      .from("platform_settings")
      .update({ n8n_webhook_url: trimmed || null })
      .eq("id", 1);

    setSavingWebhook(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Webhook global salvo",
      description: "Todas as barbearias passam a usar esta URL no envio de mensagens.",
    });
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando painel admin…</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Painel admin</h1>
        <p className="text-sm text-muted-foreground">
          Configure o n8n uma vez só — todas as contas (atuais e novas) usam este webhook. O fluxo do cliente não pede URL.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook n8n (global)</CardTitle>
          <CardDescription>
            URL de produção do workflow multi-tenant. O payload já inclui <code>barbershop_id</code>,{" "}
            <code>barbershop_slug</code> e demais campos para rotear no n8n.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveGlobalWebhook} className="space-y-3">
            <Input
              type="url"
              placeholder="https://seu-n8n.com/webhook/agente"
              value={globalWebhook}
              onChange={(e) => setGlobalWebhook(e.target.value)}
            />
            <Button type="submit" disabled={savingWebhook}>
              {savingWebhook ? "Salvando…" : "Salvar webhook global"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Barbearias cadastradas</CardTitle>
          <CardDescription>Novas contas aparecem aqui automaticamente após o cadastro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {shops.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma barbearia ainda.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {shops.map((s) => (
                <li key={s.id} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="font-medium">{s.display_name}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    /c/{s.slug} · owner {s.owner_id ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
