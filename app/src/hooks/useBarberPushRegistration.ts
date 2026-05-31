import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { registerBarberPush, supportsWebPush } from "@/lib/barberPushNotifications";

/** Mantém a inscrição push do barbeiro sincronizada quando a permissão já foi concedida. */
export function useBarberPushRegistration() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    if (!supportsWebPush()) return;
    if (Notification.permission !== "granted") return;

    void registerBarberPush().catch(() => undefined);
  }, [user?.id]);
}
