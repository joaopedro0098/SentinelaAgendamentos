import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type ExtensionTokenRow = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  active: boolean;
};

export function ExtensionConnectSection() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ExtensionTokenRow[]>([]);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [label, setLabel] = useState("Chrome");

  const loadTokens = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_extension_connect_tokens");
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao listar tokens", description: error.message, variant: "destructive" });
      return;
    }
    const body = data as { tokens?: ExtensionTokenRow[]; error?: string } | null;
    if (body?.error) {
      toast({ title: "Erro", description: body.error, variant: "destructive" });
      return;
    }
    setTokens(Array.isArray(body?.tokens) ? body.tokens : []);
  }, []);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  async function handleCreate() {
    setCreating(true);
    setFreshToken(null);
    const { data, error } = await supabase.rpc("create_extension_connect_token", {
      p_label: label.trim() || "Chrome",
    });
    setCreating(false);
    if (error) {
      toast({ title: "Erro ao gerar token", description: error.message, variant: "destructive" });
      return;
    }
    const body = data as { token?: string; error?: string } | null;
    if (body?.error || !body?.token) {
      toast({ title: "Erro ao gerar token", description: body?.error ?? "Resposta inválida.", variant: "destructive" });
      return;
    }
    setFreshToken(body.token);
    toast({
      title: "Token gerado",
      description: "Copie agora — ele não será exibido novamente.",
    });
    await loadTokens();
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    const { data, error } = await supabase.rpc("revoke_extension_connect_token", { p_token_id: id });
    setRevokingId(null);
    if (error) {
      toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" });
      return;
    }
    const body = data as { ok?: boolean; error?: string } | null;
    if (body?.error) {
      toast({ title: "Erro ao revogar", description: body.error, variant: "destructive" });
      return;
    }
    toast({ title: "Token revogado" });
    await loadTokens();
  }

  async function copyFreshToken() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      toast({ title: "Token copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  }

  return (
    <Card className="glass-panel border-border/80">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold tracking-tight">Sentinela Connect</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Extensão Chrome para WhatsApp Web. Gere um token e cole nas opções da extensão. O escopo segue
              as mesmas regras CT/CA do painel (visualização de agendamentos).
            </p>
          </div>
        </div>

        <div className="space-y-2 max-w-md">
          <Label htmlFor="extension-token-label">Nome do token (opcional)</Label>
          <Input
            id="extension-token-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Chrome — notebook clínica"
            maxLength={80}
          />
        </div>

        <Button type="button" disabled={creating} onClick={() => void handleCreate()}>
          {creating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Gerando…
            </>
          ) : (
            "Gerar novo token"
          )}
        </Button>

        {freshToken ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Copie e guarde em local seguro (mostrado uma vez):</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={freshToken} className="font-mono text-xs" />
              <Button type="button" variant="secondary" className="shrink-0" onClick={() => void copyFreshToken()}>
                <Copy className="h-4 w-4" /> Copiar
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Tokens da conta</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum token gerado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Criado {new Date(t.created_at).toLocaleString("pt-BR")}
                      {t.last_used_at ? ` · Último uso ${new Date(t.last_used_at).toLocaleString("pt-BR")}` : ""}
                      {!t.active ? " · Revogado" : ""}
                    </p>
                  </div>
                  {t.active ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revokingId === t.id}
                      onClick={() => void handleRevoke(t.id)}
                    >
                      {revokingId === t.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" /> Revogar
                        </>
                      )}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Instale a extensão em modo desenvolvedor a partir de{" "}
          <code className="text-[11px]">app/extension/sentinela-connect</code> — veja o README na pasta.
        </p>
      </CardContent>
    </Card>
  );
}
