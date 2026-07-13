import { useEffect, useRef } from "react";
import { subscribePaymentsConfigChanged } from "@agenda/lib/paymentsConfigSync";
import { useSubscription } from "@/hooks/useSubscription";

/** CA: atualiza Pagamentos quando o titular altera centralização ou regras. */
export function usePaymentsConfigBroadcast(onChange: () => void) {
  const { info } = useSubscription();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const slug = info?.account_type === "ca" ? info.owner_slug : null;

  useEffect(() => {
    if (!slug) return;
    return subscribePaymentsConfigChanged(slug, () => onChangeRef.current());
  }, [slug]);
}
