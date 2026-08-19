import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { IntegracaoAlertaProfissional } from "@/features/dashboard/hooks/useIntegracaoAlertasProfissional";

type IntegrationAlertsDotModalProps = {
  alertas: IntegracaoAlertaProfissional[];
  loading?: boolean;
  onDismissed: () => void;
  className?: string;
};

export function IntegrationAlertsDotModal({
  alertas,
  loading = false,
  onDismissed,
  className,
}: IntegrationAlertsDotModalProps) {
  const [open, setOpen] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const count = alertas.length;
  if (count === 0 && !loading) return null;

  async function handleDismiss(alertaId: string) {
    setDismissingId(alertaId);
    try {
      const { data, error } = await supabase.rpc("dispensar_alerta_integracao", { p_alerta_id: alertaId });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data) throw new Error(String((data as { error: string }).error));
      onDismissed();
      if (alertas.length <= 1) setOpen(false);
    } catch {
      /* silencioso — usuário pode tentar de novo */
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors",
          className,
        )}
        aria-label={`${count} alerta${count === 1 ? "" : "s"} de integração`}
        title="Ver alertas de integração"
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-background" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atenção nas suas integrações</DialogTitle>
            <DialogDescription>
              Encontramos algo que precisa da sua atenção. Veja abaixo o que aconteceu e como resolver.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {alertas.map((alerta) => (
                <li key={alerta.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                  <p className="text-sm font-semibold">{alerta.titulo}</p>
                  <p className="text-sm text-foreground">{alerta.mensagem}</p>
                  {alerta.mensagem_acao && (
                    <p className="text-sm text-muted-foreground">{alerta.mensagem_acao}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={dismissingId === alerta.id}
                    onClick={() => void handleDismiss(alerta.id)}
                  >
                    {dismissingId === alerta.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dispensar"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
