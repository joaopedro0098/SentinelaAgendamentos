import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, MessageSquareWarning } from "lucide-react";
import { maskPhone } from "@agenda/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMediaMdUp } from "@/hooks/useMediaMdUp";

type FailedJobRow = {
  id: string;
  telefone: string;
  resposta: string;
  last_error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  processed_at: string | null;
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

function labelResposta(body: string) {
  switch (body.trim()) {
    case "Confirmar":
      return "Confirmar";
    case "Cancelar":
      return "Cancelar";
    case "Alterar":
      return "Alterar";
    default:
      return body.trim() || "—";
  }
}

export function AdminWhatsAppFailedJobsSection() {
  const isDesktop = useMediaMdUp();
  const [jobs, setJobs] = useState<FailedJobRow[] | null>(null);
  const [failedCount24h, setFailedCount24h] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listResult, countResult] = await Promise.all([
        supabase.rpc("admin_list_failed_whatsapp_webhook_jobs", { p_limit: 100 }),
        supabase.rpc("admin_whatsapp_webhook_jobs_failed_count_24h"),
      ]);

      if (listResult.error) throw listResult.error;
      if (countResult.error) throw countResult.error;

      const payload = listResult.data;
      if (payload && typeof payload === "object" && "error" in payload) {
        setJobs([]);
      } else {
        setJobs(Array.isArray(payload) ? (payload as FailedJobRow[]) : []);
      }

      setFailedCount24h(typeof countResult.data === "number" ? countResult.data : 0);
    } catch {
      setJobs([]);
      setFailedCount24h(0);
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
          <MessageSquareWarning className="h-5 w-5 text-primary" />
          Jobs WhatsApp com falha
        </CardTitle>
        <CardDescription>
          Respostas de pacientes que falharam após {3} tentativas automáticas. Somente visível no desktop.
          {failedCount24h > 0 && (
            <span className="mt-1 block font-medium text-destructive">
              {failedCount24h} falha{failedCount24h === 1 ? "" : "s"} nas últimas 24h
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum job com status failed no momento.</p>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <ul className="divide-y divide-border/60">
              {jobs.map((job) => (
                <li key={job.id} className="px-3 py-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium tabular-nums">{maskPhone(job.telefone)}</span>
                    <span className="text-xs rounded-full bg-secondary px-2 py-0.5">{labelResposta(job.resposta)}</span>
                    <span className="text-xs text-muted-foreground">
                      Tentativas: {job.attempts}/{job.max_attempts}
                    </span>
                  </div>
                  {job.last_error && (
                    <p className="text-xs text-destructive flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="break-words">{job.last_error}</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    <span>Falhou em: {formatDateTimeBr(job.processed_at)}</span>
                    <span>Recebido: {formatDateTimeBr(job.created_at)}</span>
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
