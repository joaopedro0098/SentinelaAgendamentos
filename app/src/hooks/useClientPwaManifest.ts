import { useEffect } from "react";
import { applyClientPwaHead, type ClientPwaShop } from "@/lib/clientPwaManifest";

export function useClientPwaManifest(shop: ClientPwaShop | null) {
  useEffect(() => {
    if (!shop?.slug) return;
    return applyClientPwaHead(shop);
  }, [shop?.slug, shop?.nome, shop?.logoUrl]);
}
