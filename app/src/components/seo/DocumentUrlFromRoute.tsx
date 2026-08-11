import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { syncDocumentUrlMeta } from "@/lib/siteUrl";

/** Mantém og:url e canonical alinhados à rota atual em todo o SPA. */
export function DocumentUrlFromRoute() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    syncDocumentUrlMeta(pathname, search);
  }, [pathname, search]);

  return null;
}
