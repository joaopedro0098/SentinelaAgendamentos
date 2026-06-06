import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PermissionToggleRow } from "@/components/PermissionToggleRow";
import {
  isClientConfirmationPushEnabled,
  registerClientConfirmationPushLocal,
  supportsClientConfirmationPush,
  unregisterClientConfirmationPushLocal,
} from "@/lib/clientConfirmationPush";
import { isStandalonePwa } from "@/lib/pwaInstall";

type Props = {
  shopName?: string;
};

const APP_REQUIRED_MESSAGE = "Função habilitada somente com app instalado";

export function ClientConfirmationPushToggle({ shopName }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const installed = isStandalonePwa();
  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
  const unsupported = !supportsClientConfirmationPush();
  const vapidMissing = !import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  const toggleLocked = !installed || unsupported || vapidMissing;

  useEffect(() => {
    if (installed && !unsupported && !vapidMissing) {
      setEnabled(isClientConfirmationPushEnabled());
    }
  }, [installed, unsupported, vapidMissing]);

  async function handleToggle() {
    if (!installed) {
      toast.message(APP_REQUIRED_MESSAGE);
      return;
    }

    if (unsupported) {
      toast.error("Use Chrome ou Edge atualizado para ativar os avisos.");
      return;
    }

    if (vapidMissing) {
      toast.error("Notificações ainda não disponíveis neste ambiente.");
      return;
    }

    if (denied) {
      toast.error("Notificações bloqueadas. Ative nas configurações do app e recarregue.");
      return;
    }

    if (enabled) {
      setBusy(true);
      try {
        await unregisterClientConfirmationPushLocal();
        setEnabled(false);
        toast.success("Notificações desativadas neste dispositivo");
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const result = await registerClientConfirmationPushLocal({ requestPermission: true });
      if (result.ok) {
        setEnabled(true);
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
  const hint = !installed
    ? APP_REQUIRED_MESSAGE
    : unsupported
      ? "Push não suportado neste navegador."
      : denied
        ? "Notificações bloqueadas no app."
        : undefined;

  return (
    <div className="rounded-xl border border-border/80 bg-card px-4 py-3">
      <PermissionToggleRow
        id="client-confirmation-push-toggle"
        label={label}
        description="Lembrete no dia anterior para confirmar o horário."
        checked={enabled}
        disabled={toggleLocked}
        busy={busy}
        onToggle={() => void handleToggle()}
        hint={hint}
      />
    </div>
  );
}
