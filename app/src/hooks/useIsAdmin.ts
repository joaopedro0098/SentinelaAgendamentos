import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoadingAdmin(false);
      return;
    }

    let active = true;
    (async () => {
      setLoadingAdmin(true);
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!active) return;
      setIsAdmin(!error && !!data);
      setLoadingAdmin(false);
    })();

    return () => {
      active = false;
    };
  }, [user]);

  return { isAdmin, loadingAdmin };
}
