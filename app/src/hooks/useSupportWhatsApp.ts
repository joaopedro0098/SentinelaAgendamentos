import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSupportWhatsApp() {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_support_whatsapp");
    if (!error && typeof data === "string" && data.trim()) {
      setPhone(data.trim());
    } else {
      setPhone(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { phone, loading, refresh: load };
}
