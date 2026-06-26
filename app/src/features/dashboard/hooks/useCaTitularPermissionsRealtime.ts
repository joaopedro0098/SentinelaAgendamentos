import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEBOUNCE_MS = 400;

type PermissionRow = {
  owner_can_view_appointments?: boolean;
  owner_can_edit_appointments?: boolean;
};

type Options = {
  userId: string | null;
  accountType: string | undefined;
  onPermissionsChange: () => void;
};

/** Escuta UPDATE em aggregated_accounts (toggles de permissão CA → titular). */
export function useCaTitularPermissionsRealtime({
  userId,
  accountType,
  onPermissionsChange,
}: Options) {
  const onChangeRef = useRef(onPermissionsChange);
  onChangeRef.current = onPermissionsChange;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId || !accountType) return;

    const isCaAccount = accountType === "ca";
    const filter = isCaAccount
      ? `aggregated_user_id=eq.${userId}`
      : `owner_user_id=eq.${userId}`;

    const channel = supabase
      .channel(`ca-titular-permissions:${userId}:${isCaAccount ? "ca" : "owner"}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "aggregated_accounts",
          filter,
        },
        (payload) => {
          const oldRow = payload.old as PermissionRow | undefined;
          const newRow = payload.new as PermissionRow;
          if (
            oldRow?.owner_can_view_appointments === newRow.owner_can_view_appointments &&
            oldRow?.owner_can_edit_appointments === newRow.owner_can_edit_appointments
          ) {
            return;
          }
          if (debounceRef.current != null) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            onChangeRef.current();
          }, DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [userId, accountType]);
}
