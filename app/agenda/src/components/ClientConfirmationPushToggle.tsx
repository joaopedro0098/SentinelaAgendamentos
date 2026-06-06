import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { PermissionToggleRow } from "@/components/PermissionToggleRow";
import {
  registerClientConfirmationPushLocal,
  supportsClientConfirmationPush,
  unregisterClientConfirmationPushLocal,
} from "@/lib/clientConfirmationPush";
import { isIosDevice, isStandalonePwa } from "@/lib/pwaInstall";

type Props = {
  shopName?: string;
};

function browserNotificationHelp(isIos: boolean) {
  if (isIos) {
    return "No Safari: Ajustes → Safari → Notificações → permita para este site. Depois recarregue a página.";
  }
  return "No Chrome/Edge: toque no cadeado ao lado da URL → Configurações do site → Notificações → Permitir. Depois recarregue.";
}

export function ClientConfirmationPushToggle({ shopName }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showBrowserHelp, setShowBrowserHelp] = useState(false);
  const installed = isStandalonePwa();
  const isIos = typeof window !== "undefined" && isIosDevice();
  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
  const unsupported = !supportsClientConfirmationPush();
  const vapidMissing = !import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();

  async function handleToggle() {
    if (unsupported) {
      toast.error("Use Chrome ou Edge atualizado para ativar os avisos.");
      return;
    }

    if (enabled) {
      setBusy(true);
      try {
        await unregisterClientConfirmationPushLocal();
        setEnabled(false);
        setShowBrowserHelp(false);
        toast.success("Notificações desativadas neste dispositivo");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (denied) {
      toast.error(browserNotificationHelp(isIos));
      return;
    }

    if (vapidMissing) {
      toast.error("Notificações ainda não disponíveis neste ambiente.");
      return;
    }

    if (!installed) {
      if (Notification.permission === "default") {
        setShowBrowserHelp(true);
        toast.message("Ative as notificações no navegador", {
          description: browserNotificationHelp(isIos),
        });
        return;
      }
      if (Notification.permission !== "granted") {
        setShowBrowserHelp(true);
        toast.error(browserNotificationHelp(isIos));
        return;
      }
      // Permissão já concedida manualmente no navegador — segue para inscrever push.
    }

    setBusy(true);
    try {
      const result = await registerClientConfirmationPushLocal({
        requestPermission: installed,
      });
      if (result.ok) {
        setEnabled(true);
        setShowBrowserHelp(false);
        toast.success(result.message);
      } else {
        setEnabled(false);
        toast.error(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const label = shopName ? `Avisos de ${shopName}` : "Avisos de confirmação";
  const hint = unsupported
    ? "Push não suportado neste navegador."
    : denied
      ? "Notificações bloqueadas no navegador."
      : !installed
        ? "No navegador, siga as instruções abaixo."
        : undefined;

  return (
    <div className="space-y-2 rounded-xl border border-border/80 bg-card px-4 py-3">
      <PermissionToggleRow
        id="client-confirmation-push-toggle"
        label={label}
        description="Lembrete no dia anterior para confirmar o horário."
        checked={enabled}
        busy={busy}
        onToggle={() => void handleToggle()}
        hint={hint}
      />

      {showBrowserHelp && !installed && (
        <Card className="p-3 text-xs text-muted-foreground space-y-1.5 border-border/70 bg-background">
          <p className="font-semibold text-foreground text-sm">Como ativar no navegador</p>
          <p>{browserNotificationHelp(isIos)}</p>
          <p className="text-[11px]">
            Depois de permitir, toque no interruptor novamente. Com o app instalado, o celular pede a permissão
            automaticamente.
          </p>
        </Card>
      )}
    </div>
  );
}
