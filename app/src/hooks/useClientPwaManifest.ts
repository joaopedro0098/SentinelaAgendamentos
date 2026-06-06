import { useEffect } from "react";
import { applyClientPwaHead, type ClientPwaShopWithLogo } from "@/lib/clientPwaManifest";

export function useClientPwaManifest(shop: ClientPwaShopWithLogo | null) {
  useEffect(() => {
    if (!shop?.slug) return;
    return applyClientPwaHead(shop);
  }, [shop?.slug, shop?.nome, shop?.logoUrl]);
}
