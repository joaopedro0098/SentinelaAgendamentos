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

  useEffect(() => {
    setEnabled(isBarberPushEnabled());
  }, []);

  async function handleToggle() {
    if (unsupported) {
      toast({
        title: "Sem suporte",
        description: "Este navegador não suporta notificações push.",
        variant: "destructive",
      });
      return;
    }

    if (denied) {
      toast({
        title: "Notificações bloqueadas",
        description: "Libere nas configurações do navegador e tente novamente.",
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
        "h-9 w-9 shrink-0 rounded-full",
        enabled && "border-primary bg-primary/10 text-primary hover:bg-primary/15",
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
      disabled={busy || unsupported || denied}
      onClick={() => void handleToggle()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Bell className={cn("h-4 w-4", enabled && "fill-current")} />
      )}
    </Button>
  );
}
