import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare } from "lucide-react";

type Conv = {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  last_message_at: string;
  last_preview?: string | null;
};

function shortTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function ConversationsList() {
  const { user } = useAuth();
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string>("");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "Conversas — BarberChat"; }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: shop } = await supabase
        .from("barbershops")
        .select("id, display_name")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!shop) { setLoading(false); return; }
      setShopId(shop.id);
      setShopName(shop.display_name);

      const { data: convs } = await supabase
        .from("conversations")
        .select("id, customer_phone, customer_name, last_message_at")
        .eq("barbershop_id", shop.id)
        .order("last_message_at", { ascending: false })
        .limit(100);

      const list = (convs ?? []) as Conv[];

      // Buscar prévia da última mensagem de cada conversa
      if (list.length) {
        const ids = list.map((c) => c.id);
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, content, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false });
        const previewMap = new Map<string, string>();
        for (const m of msgs ?? []) {
          if (!previewMap.has(m.conversation_id)) previewMap.set(m.conversation_id, m.content);
        }
        list.forEach((c) => { c.last_preview = previewMap.get(c.id) ?? null; });
      }

      setConvs(list);
      setLoading(false);
    })();
  }, [user]);

  // Realtime: nova mensagem chega → atualiza o topo
  useEffect(() => {
    if (!shopId) return;
    const ch = supabase.channel(`shop-msgs-${shopId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `barbershop_id=eq.${shopId}` },
        (payload) => {
          const m = payload.new as { conversation_id: string; content: string; created_at: string };
          setConvs((prev) => {
            const idx = prev.findIndex((c) => c.id === m.conversation_id);
            if (idx < 0) return prev;
            const updated = { ...prev[idx], last_preview: m.content, last_message_at: m.created_at };
            const rest = prev.filter((_, i) => i !== idx);
            return [updated, ...rest];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [shopId]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!shopId) {
    return (
      <div className="p-6 max-w-md">
        <h2 className="text-lg font-semibold mb-2">Configure sua barbearia</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Você ainda não tem uma barbearia configurada nesta conta.
        </p>
        <Link to="/app/settings" className="text-primary hover:underline text-sm">Ir para configurações →</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 md:px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Conversas</h1>
        <p className="text-xs text-muted-foreground">{shopName}</p>
      </header>

      {convs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center">
            <MessageSquare className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
          <p className="text-xs text-muted-foreground">Compartilhe seu link na aba <Link to="/app/settings" className="text-primary hover:underline">Barbearia</Link>.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {convs.map((c) => (
            <li key={c.id}>
              <Link to={`/app/c/${c.id}`} className="flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-secondary/50 transition">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="bg-primary-glow text-primary-foreground">
                    {(c.customer_name ?? c.customer_phone).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{c.customer_name ?? c.customer_phone}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0">{shortTime(c.last_message_at)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{c.last_preview ?? "—"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
