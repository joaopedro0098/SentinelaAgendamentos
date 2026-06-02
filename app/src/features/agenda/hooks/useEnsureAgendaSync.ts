import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgendaSyncPhase = "loading" | "ready" | "not_found" | "error";

const agendaSyncCache = new Map<string, AgendaSyncPhase>();

export function getAgendaSyncPhase(slug: string | undefined) {
  if (!slug) return undefined;
  return agendaSyncCache.get(slug);
}

export function primeAgendaSyncPhase(slug: string, phase: AgendaSyncPhase) {
  agendaSyncCache.set(slug, phase);
}

export function clearAgendaSyncCache() {
  agendaSyncCache.clear();
}

export function useEnsureAgendaSync(slug: string | undefined) {
  const cached = slug ? agendaSyncCache.get(slug) : undefined;
  const [phase, setPhase] = useState<AgendaSyncPhase>(() => {
    if (!slug) return "not_found";
    return cached ?? "loading";
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setPhase("not_found");
      return;
    }

    const known = agendaSyncCache.get(slug);
    if (known && known !== "loading") {
      setPhase(known);
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
        agendaSyncCache.set(slug, "error");
        setPhase("error");
        return;
      }

      if (!data) {
        agendaSyncCache.set(slug, "not_found");
        setPhase("not_found");
        return;
      }

      agendaSyncCache.set(slug, "ready");
      setPhase("ready");
    })();

    return () => {
      active = false;
    };
  }, [slug]);

  return { phase, errorMsg };
}
