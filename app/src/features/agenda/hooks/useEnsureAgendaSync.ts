import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgendaSyncPhase = "loading" | "ready" | "not_found" | "error";

export function useEnsureAgendaSync(slug: string | undefined) {
  const [phase, setPhase] = useState<AgendaSyncPhase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setPhase("not_found");
      return;
    }

    let active = true;
    (async () => {
      setPhase("loading");
      const { data, error } = await supabase.rpc("ensure_agenda_from_barbershop_slug", {
        p_slug: slug,
      });

      if (!active) return;

      if (error) {
        const missingFn =
          error.message.includes("ensure_agenda_from_barbershop_slug") ||
          error.message.includes("schema cache");
        setErrorMsg(
          missingFn
            ? "A sincronização de agendamento ainda não foi configurada no banco. Rode a migration booking_agenda_bridge no Supabase."
            : error.message,
        );
        setPhase("error");
        return;
      }

      if (!data) {
        setPhase("not_found");
        return;
      }

      setPhase("ready");
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  return { phase, errorMsg };
}
