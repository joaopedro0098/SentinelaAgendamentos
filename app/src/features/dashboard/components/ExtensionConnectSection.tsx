import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, Trash2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import {
  CONNECT_EXTENSION_STORE_URL,
  configureConnectExtension,
  isConnectExtensionInstalled,
} from "@/lib/extensionConnectClient";

type ExtensionTokenRow = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

const SETUP_STEPS = [
  {
    title: "Instale a extensão no Chrome",
    body: CONNECT_EXTENSION_STORE_URL
      ? "Clique no botão abaixo para instalar pela Chrome Web Store (um clique)."
      : "Abra chrome://extensions, ative Modo do desenvolvedor e carregue a pasta da extensão (passo necessário enquanto não estiver na loja).",
  },
  {
    title: "Gere o token aqui",
    body: "Clique em Gerar novo token e copie o código sc_live_… (ele só aparece uma vez).",
  },
  {
    title: "Aplique na extensão",
    body: "Com a extensão instalada, use Aplicar na extensão — o token é enviado automaticamente, sem colar manualmente.",
  },
  {
    title: "Use no WhatsApp Web",
    body: "Abra web.whatsapp.com, selecione uma conversa individual e o painel Sentinela aparece à direita.",
  },
] as const;

export function ExtensionConnectSection() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [checkingExtension, setCheckingExtension] = useState(true);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [tokens, setTokens] = useState<ExtensionTokenRow[]>([]);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [label, setLabel] = useState("Chrome");

  const refreshExtensionStatus = useCallback(async () => {
    setCheckingExtension(true);
    const installed = await isConnectExtensionInstalled();
    setExtensionInstalled(installed);
    setCheckingExtension(false);
    return installed;
  }, []);

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
    void refreshExtensionStatus();
  }, [loadTokens, refreshExtensionStatus]);

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
      description: "Copie agora ou use Aplicar na extensão.",
    });
    await loadTokens();

    const installed = await refreshExtensionStatus();
    if (installed) {
      void handleApplyToExtension(body.token);
    }
  }

  async function handleApplyToExtension(tokenOverride?: string) {
    const token = (tokenOverride ?? freshToken ?? "").trim();
    if (!token) {
      toast({
        title: "Gere um token primeiro",
        description: "Clique em Gerar novo token antes de aplicar na extensão.",
        variant: "destructive",
      });
      return;
    }

    setApplying(true);
    const result = await configureConnectExtension(token);
    setApplying(false);

    if (result.ok) {
      toast({
        title: result.pingOk ? "Extensão configurada" : "Token salvo na extensão",
        description: result.message ?? (result.pingOk ? "Conexão OK." : "Teste a conexão abrindo o WhatsApp Web."),
      });
      setExtensionInstalled(true);
      return;
    }

    if (result.reason === "not_installed") {
      toast({
        title: "Extensão não detectada",
        description: CONNECT_EXTENSION_STORE_URL
          ? "Instale a extensão pelo botão acima e tente novamente."
          : "Instale a extensão no Chrome (passo 1) e recarregue esta página.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Não foi possível configurar",
      description: result.message ?? "Cole o token manualmente nas opções da extensão.",
      variant: "destructive",
    });
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
    <div className="space-y-6">
      <Card className="glass-panel border-border/80">
        <CardContent className="pt-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Como configurar</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Depois da primeira instalação, gerar token + aplicar na extensão leva menos de um minuto.
            </p>
          </div>

          <ol className="space-y-4">
            {SETUP_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                  {index === 0 && CONNECT_EXTENSION_STORE_URL ? (
                    <Button type="button" variant="secondary" size="sm" className="mt-1" asChild>
                      <a href={CONNECT_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" /> Instalar no Chrome
                      </a>
                    </Button>
                  ) : null}
                  {index === 0 && !CONNECT_EXTENSION_STORE_URL ? (
                    <details className="mt-1 rounded-md border border-border/70 bg-secondary/20 px-3 py-2 text-sm">
                      <summary className="cursor-pointer font-medium text-foreground">Ver passos de instalação manual</summary>
                      <ol className="mt-2 list-decimal pl-5 space-y-1 text-muted-foreground">
                        <li>
                          Abra{" "}
                          <a href="chrome://extensions/" className="text-primary underline-offset-2 hover:underline">
                            chrome://extensions
                          </a>
                        </li>
                        <li>Ative <strong className="text-foreground">Modo do desenvolvedor</strong></li>
                        <li>Clique <strong className="text-foreground">Carregar sem compactação</strong></li>
                        <li>
                          Selecione a pasta{" "}
                          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">app/extension/sentinela-connect</code>{" "}
                          do projeto Sentinela
                        </li>
                      </ol>
                      <p className="mt-2 text-xs">
                        Em produção, a extensão será instalada com um clique pela Chrome Web Store — sem modo desenvolvedor.
                      </p>
                    </details>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              extensionInstalled
                ? "border-primary/30 bg-primary/5 text-foreground"
                : "border-border/70 bg-secondary/20 text-muted-foreground"
            }`}
          >
            {checkingExtension ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
                <span>Verificando extensão no navegador…</span>
              </>
            ) : extensionInstalled ? (
              <>
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Extensão detectada neste Chrome. Gere o token e use <strong>Aplicar na extensão</strong>.</span>
              </>
            ) : (
              <span>
                Extensão ainda não detectada nesta aba. Instale o passo 1 e{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline font-medium"
                  onClick={() => void refreshExtensionStatus()}
                >
                  verificar novamente
                </button>
                .
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border/80">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <KeyRound className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold tracking-tight">Token da extensão</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cada navegador ou computador usa um token. O escopo segue as mesmas regras CT/CA do painel.
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

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={creating} onClick={() => void handleCreate()}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerando…
                </>
              ) : (
                "Gerar novo token"
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={applying || !freshToken}
              onClick={() => void handleApplyToExtension()}
            >
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Aplicando…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Aplicar na extensão
                </>
              )}
            </Button>
          </div>

          {freshToken ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Token gerado (mostrado uma vez). Se a extensão estiver instalada, já tentamos aplicar automaticamente.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={freshToken} className="font-mono text-xs" />
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => void copyFreshToken()}>
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Tokens ativos</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </p>
            ) : tokens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum token ativo. Gere um novo acima.</p>
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
                      </p>
                    </div>
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
