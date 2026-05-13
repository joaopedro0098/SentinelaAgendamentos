import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Send, Phone, Video, MoreVertical, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatPhoneBR, isValidPhoneBR } from "@/lib/phone";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Barbershop = {
  id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string;
  welcome_message: string;
};

type Message = {
  id: string;
  sender: "customer" | "ai";
  content: string;
  created_at: string;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  _local?: boolean;
};

const VISITOR_KEY_PREFIX = "barberchat:visitor:";
const PHONE_KEY_PREFIX = "barberchat:phone:";

function getOrCreateVisitorId(slug: string): string {
  const key = VISITOR_KEY_PREFIX + slug;
  let id = localStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(key, id);
  }
  return id;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Hoje";
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
}

export default function ChatClient() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "demo";

  const [shop, setShop] = useState<Barbershop | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [visitorId] = useState<string>(() => getOrCreateVisitorId(slug));
  const [phone, setPhone] = useState<string | null>(() => localStorage.getItem(PHONE_KEY_PREFIX + slug));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // SEO
  useEffect(() => {
    const title = shop ? `${shop.display_name} • Conversa` : "Atendimento — Barbearia";
    document.title = title.slice(0, 60);
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      `Converse com ${shop?.display_name ?? "a barbearia"} de forma rápida e direta.`.slice(0, 160),
    );
  }, [shop]);

  // Carrega barbearia
  useEffect(() => {
    (async () => {
      setShopLoading(true);
      const { data } = await supabase
        .from("barbershops")
        .select("id, slug, display_name, avatar_url, status_text, welcome_message")
        .eq("slug", slug)
        .maybeSingle();
      setShop(data ?? null);
      setShopLoading(false);
    })();
  }, [slug]);

  // Carrega histórico (procura por phone OU visitor_id)
  useEffect(() => {
    if (!shop) return;
    (async () => {
      const conversationKey = phone ?? `visitor:${visitorId}`;
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("barbershop_id", shop.id)
        .eq("customer_phone", conversationKey)
        .maybeSingle();

      if (!conv) {
        setConversationId(null);
        setMessages([
          {
            id: "welcome",
            sender: "ai",
            content: shop.welcome_message,
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }
      setConversationId(conv.id);
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, sender, content, created_at, status")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []) as Message[]);
    })();
  }, [shop, phone, visitorId]);

  // Realtime
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            const idx = prev.findIndex((x) => x._local && x.sender === m.sender && x.content === m.content);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = m;
              return copy;
            }
            return [...prev.filter((x) => x.id !== "welcome"), m];
          });
          if (m.sender === "ai") setAiTyping(false);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, aiTyping]);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, [shop]);

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: Message[] }> = [];
    for (const m of messages) {
      const day = dayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!shop || !input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    // Se a mensagem do cliente é um telefone válido e ainda não temos um, salva
    let phoneToSend = phone;
    if (!phoneToSend && isValidPhoneBR(text)) {
      const formatted = formatPhoneBR(text);
      localStorage.setItem(PHONE_KEY_PREFIX + slug, formatted);
      setPhone(formatted);
      phoneToSend = formatted;
    }

    const localId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== "welcome"),
      {
        id: localId,
        sender: "customer",
        content: text,
        created_at: new Date().toISOString(),
        status: "sending",
        _local: true,
      },
    ]);
    setAiTyping(true);

    try {
      // Importante: a chamada para o n8n é feita pelo servidor (Edge Function)
      // para evitar erros de CORS no navegador. A própria função `send-message`
      // já encaminha o payload completo para o webhook configurado pela barbearia.
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: {
          barbershop_slug: shop.slug,
          visitor_id: visitorId,
          customer_phone: phoneToSend,
          message: text,
        },
      });
      if (error) throw error;
      if (data?.conversation_id && !conversationId) setConversationId(data.conversation_id);
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, status: "sent" } : m)));
      if (data?.n8n_error) {
        toast({
          title: "Webhook n8n com falha",
          description: String(data.n8n_error),
          variant: "destructive",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar";
      toast({ title: "Erro ao enviar", description: msg, variant: "destructive" });
      setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, status: "failed" } : m)));
      setAiTyping(false);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  // ---------- RENDER ----------
  if (shopLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-chat-app-bg">
        <div className="text-muted-foreground text-sm">Carregando…</div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-chat-app-bg p-6 text-center">
        <h1 className="text-xl font-semibold">Barbearia não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O link <code className="px-1 rounded bg-muted">/c/{slug}</code> não corresponde a nenhuma barbearia.
        </p>
        <Link to="/" className="text-primary text-sm underline">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-chat-app-bg">
      <header className="bg-primary text-primary-foreground px-2 sm:px-4 py-2.5 flex items-center gap-2 shadow-sm shrink-0">
        <Link to="/" className="p-2 -ml-1 rounded-full hover:bg-primary-glow/30 transition" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar className="h-10 w-10">
          {shop.avatar_url && <AvatarImage src={shop.avatar_url} alt={shop.display_name} />}
          <AvatarFallback className="bg-primary-glow text-primary-foreground font-semibold">
            {shop.display_name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 ml-1">
          <h1 className="font-medium truncate leading-tight">{shop.display_name}</h1>
          <p className="text-xs opacity-80 truncate">{aiTyping ? "digitando…" : shop.status_text}</p>
        </div>
        <button className="p-2 rounded-full hover:bg-primary-glow/30 transition" aria-label="Vídeo">
          <Video className="h-5 w-5" />
        </button>
        <button className="p-2 rounded-full hover:bg-primary-glow/30 transition" aria-label="Ligar">
          <Phone className="h-5 w-5" />
        </button>
        <button className="p-2 rounded-full hover:bg-primary-glow/30 transition" aria-label="Mais">
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      <div ref={scrollRef} className="chat-pattern chat-scroll flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-2xl space-y-1">
          {grouped.map((group, gi) => (
            <div key={gi} className="space-y-1">
              <div className="flex justify-center my-3">
                <span className="text-[11px] bg-background/80 text-muted-foreground px-2.5 py-1 rounded-md shadow-sm">
                  {group.day}
                </span>
              </div>
              {group.items.map((m, i) => {
                const isOut = m.sender === "customer";
                const prev = group.items[i - 1];
                const showTail = !prev || prev.sender !== m.sender;
                return (
                  <div key={m.id} className={cn("flex animate-bubble-in", isOut ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "relative max-w-[80%] sm:max-w-[70%] px-3 py-1.5 shadow-sm text-[15px] leading-snug text-chat-bubble-foreground",
                        isOut
                          ? "bg-chat-bubble-out rounded-2xl rounded-tr-md"
                          : "bg-chat-bubble-in rounded-2xl rounded-tl-md",
                        showTail && (isOut ? "bubble-tail-out" : "bubble-tail-in"),
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words pr-12">{m.content}</p>
                      <span className="absolute bottom-1 right-2 flex items-center gap-0.5 text-[10px] text-chat-time">
                        {timeLabel(m.created_at)}
                        {isOut && (
                          <span className="ml-0.5">
                            {m.status === "sending" && <Check className="h-3 w-3 opacity-50" />}
                            {m.status === "sent" && <Check className="h-3 w-3" />}
                            {m.status === "delivered" && <CheckCheck className="h-3 w-3" />}
                            {m.status === "read" && <CheckCheck className="h-3 w-3 text-primary" />}
                            {m.status === "failed" && <span className="text-destructive">!</span>}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {aiTyping && (
            <div className="flex justify-start animate-bubble-in">
              <div className="bg-chat-bubble-in rounded-2xl rounded-tl-md px-4 py-3 shadow-sm flex items-center gap-1">
                <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground inline-block" />
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSend}
        className="bg-chat-app-bg border-t border-chat-divider px-2 py-2 flex items-end gap-2 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex-1 bg-chat-input rounded-full px-4 py-2 shadow-sm">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Mensagem"
            className="w-full bg-transparent outline-none text-[15px] placeholder:text-muted-foreground"
            disabled={sending}
            maxLength={2000}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 rounded-full bg-primary hover:bg-primary-glow shrink-0"
          disabled={!input.trim() || sending}
          aria-label="Enviar"
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}
