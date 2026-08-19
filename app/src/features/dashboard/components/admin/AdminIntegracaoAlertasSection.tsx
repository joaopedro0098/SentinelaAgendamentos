import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Blocks, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";

type AdminIntegracaoAlertaRow = {
  id: string;
  integracao: string;
  codigo: string;
  titulo: string;
  mensagem: string;
  severidade: string;
  criado_em: string;
  reaberto_em: string | null;
  atualizado_em: string;
};

function formatDateTimeBr(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminIntegracaoAlertasSection() {
  const isDesktop = useMediaMdUp();
  const [alertas, setAlertas] = useState<AdminIntegracaoAlertaRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_list_alertas_integracao", { p_limit: 100 });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data) {
        setAlertas([]);
      } else {
        setAlertas(Array.isArray(data) ? (data as AdminIntegracaoAlertaRow[]) : []);
      }
    } catch {
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    void load();
  }, [isDesktop, load]);

  if (!isDesktop) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Blocks className="h-5 w-5 text-primary" />
          Alertas de integração (plataforma)
        </CardTitle>
        <CardDescription>
          Problemas globais de configuração que afetam todas as barbearias — ex.: templates Twilio ausentes nos secrets.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !alertas || alertas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta de integração ativo no momento.</p>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <ul className="divide-y divide-border/60">
              {alertas.map((alerta) => (
                <li key={alerta.id} className="px-3 py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium">{alerta.titulo}</span>
                    <span className="text-xs rounded-full bg-secondary px-2 py-0.5">{alerta.codigo}</span>
                  </div>
                  <p className="text-sm text-foreground">{alerta.mensagem}</p>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <span>Configure o secret correspondente no Supabase e aguarde o próximo ciclo do cron.</span>
                  </p>
                  <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    <span>Atualizado: {formatDateTimeBr(alerta.atualizado_em)}</span>
                    {alerta.reaberto_em && <span>Reaberto: {formatDateTimeBr(alerta.reaberto_em)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
