import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { isBarberPushEnabled, registerBarberPush, supportsWebPush } from "@/lib/barberPushNotifications";

type PermissionToggleRowProps = {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onToggle: () => void;
  hint?: string;
};

export function PermissionToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  busy,
  onToggle,
  hint,
}: PermissionToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {label}
        </label>
        <p className="mt-1 text-[11px] leading-tight text-muted-foreground truncate">{description}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-destructive truncate">{hint}</p>}
      </div>
      {busy ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
            checked ? "bg-primary" : "bg-muted",
            disabled && "opacity-60",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      )}
    </div>
  );
}

export function BarberPushToggle() {
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

  const hint = unsupported
    ? "Push não suportado neste navegador."
    : denied
      ? "Notificações bloqueadas no navegador."
      : undefined;

  return (
    <PermissionToggleRow
      id="barber-push-toggle"
      label="Notificações de agendamentos"
      description="Push de novos agendamentos, alterações e cancelamentos."
      checked={enabled}
      busy={busy}
      onToggle={() => void handleToggle()}
      hint={hint}
    />
  );
}
