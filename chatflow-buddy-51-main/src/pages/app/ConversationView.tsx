import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  sender: "customer" | "ai";
  content: string;
  created_at: string;
};

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const [conv, setConv] = useState<{ customer_phone: string; customer_name: string | null } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = "Conversa — BarberChat"; }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c } = await supabase.from("conversations").select("customer_phone, customer_name").eq("id", id).maybeSingle();
      setConv(c ?? null);
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, sender, content, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []) as Message[]);
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`conv-view-${id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (p) => {
          const m = p.new as Message;
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!conv) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="flex flex-col h-screen md:h-full">
      <header className="bg-primary text-primary-foreground px-2 py-2.5 flex items-center gap-2 shrink-0">
        <Link to="/app" className="p-2 -ml-1 rounded-full hover:bg-primary-glow/30" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary-glow text-primary-foreground">
            {(conv.customer_name ?? conv.customer_phone).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 ml-1">
          <h1 className="font-medium truncate leading-tight">{conv.customer_name ?? conv.customer_phone}</h1>
          <p className="text-xs opacity-80 truncate">{conv.customer_phone}</p>
        </div>
      </header>

      <div ref={scrollRef} className="chat-pattern chat-scroll flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-2xl space-y-1">
          {messages.map((m) => {
            const isCustomer = m.sender === "customer";
            // No painel: cliente à esquerda (branco), IA (a própria barbearia) à direita (verde)
            return (
              <div key={m.id} className={cn("flex", isCustomer ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[80%] sm:max-w-[70%] px-3 py-1.5 shadow-sm text-[15px] leading-snug text-chat-bubble-foreground",
                    isCustomer
                      ? "bg-chat-bubble-in rounded-2xl rounded-tl-md"
                      : "bg-chat-bubble-out rounded-2xl rounded-tr-md",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words pr-12 relative">
                    {m.content}
                    <span className="text-[10px] text-chat-time absolute bottom-0 right-0 translate-y-1">
                      {timeLabel(m.created_at)}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border-t border-border px-4 py-3 text-xs text-center text-muted-foreground shrink-0">
        Modo somente leitura — as respostas são geradas pelo seu agente do n8n.
      </div>
    </div>
  );
}
