import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { isBarberPushEnabled, registerBarberPush, supportsWebPush } from "@/lib/barberPushNotifications";

export function BarberPushToggle({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(() => isBarberPushEnabled());
  const [busy, setBusy] = useState(false);
  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
  const unsupported = !supportsWebPush();
  const vapidMissing = !import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

  useEffect(() => {
    setEnabled(isBarberPushEnabled());
  }, []);

  async function handleToggle() {
    if (unsupported) {
      toast({
        title: "Sem suporte",
        description: "Use Chrome, Edge ou Firefox atualizado para ativar notificações no computador.",
        variant: "destructive",
      });
      return;
    }

    if (denied) {
      toast({
        title: "Notificações bloqueadas",
        description:
          "No Chrome/Edge: clique no cadeado ao lado da URL → Configurações do site → Notificações → Permitir. Depois recarregue a página.",
        variant: "destructive",
      });
      return;
    }

    if (vapidMissing) {
      toast({
        title: "Push não configurado",
        description: "Notificações push ainda não foram configuradas neste ambiente.",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      if (enabled) {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await (await registration.pushManager.getSubscription())?.unsubscribe();
        setEnabled(false);
        toast({ title: "Notificações desativadas neste dispositivo" });
        return;
      }

      const result = await registerBarberPush({ requestPermission: true });
      if (result.ok) {
        setEnabled(true);
        toast({ title: "Notificações ativadas", description: result.message });
      } else {
        toast({
          title: "Não foi possível ativar",
          description: result.message,
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "h-9 w-9 shrink-0 rounded-full transition-colors relative z-10",
        enabled
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        (denied || unsupported) && "opacity-80",
        className,
      )}
      aria-pressed={enabled}
      aria-label={
        enabled
          ? "Desativar notificações de novos agendamentos"
          : "Ativar notificações de novos agendamentos"
      }
      title={
        unsupported
          ? "Push não suportado neste navegador"
          : denied
            ? "Notificações bloqueadas no navegador"
            : enabled
              ? "Notificações de agendamento ativas"
              : "Ativar notificações de novos agendamentos"
      }
      disabled={busy}
      onClick={() => void handleToggle()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Bell className={cn("h-4 w-4", enabled && "fill-primary-foreground")} />
      )}
    </Button>
  );
}
