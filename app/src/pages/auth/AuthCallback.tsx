import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AuthCallback() {
  const navigate = useNavigate();
  useEffect(() => {
    // Supabase processa o hash automaticamente; quando a sessão aparecer, redirecionamos
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate("/app", { replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/app", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Concluindo login…
    </div>
  );
}
