/**
 * Cliente único do app principal (import relativo — `@/` dentro de agenda
 * apontaria de volta para este arquivo e criaria ciclo).
 */
export {
  getSupabase,
  supabase,
  isSupabaseConfigured,
} from "../../../../src/integrations/supabase/client";
