import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Home = () => {
  const nav = useNavigate();
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("barbearias")
        .select("slug")
        .eq("ativa", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.slug) nav(`/agendar/${data.slug}`, { replace: true });
    })();
  }, [nav]);
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-surface">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
};

export default Home;
