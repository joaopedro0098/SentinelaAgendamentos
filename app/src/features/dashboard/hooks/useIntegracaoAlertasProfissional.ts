import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type IntegracaoAlertaProfissional = {
  id: string;
  integracao: string;
  codigo: string;
  titulo: string;
  mensagem: string;
  mensagem_acao: string | null;
  severidade: string;
  criado_em: string;
  reaberto_em: string | null;
  atualizado_em: string;
};

export function useIntegracaoAlertasProfissional(barbeariaId: string | null) {
  const [alertas, setAlertas] = useState<IntegracaoAlertaProfissional[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!barbeariaId) {
      setAlertas([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("list_alertas_integracao_profissional", {
        p_barbearia_id: barbeariaId,
      });
      if (error) throw error;
      if (data && typeof data === "object" && "error" in data) {
        setAlertas([]);
        return;
      }
      setAlertas(Array.isArray(data) ? (data as IntegracaoAlertaProfissional[]) : []);
    } catch {
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  }, [barbeariaId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!barbeariaId) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [barbeariaId, refresh]);

  return { alertas, loading, refresh, count: alertas.length };
}
