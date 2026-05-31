import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { applyPwaWindowTitle, isStandalonePwa } from "@/lib/pwaInstall";

/** Garante título fixo e comportamento de app nativo quando instalado. */
export function PwaStandaloneChrome() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isStandalonePwa()) return;

    applyPwaWindowTitle();

    const observer = new MutationObserver(() => {
      applyPwaWindowTitle();
    });

    const titleElement = document.querySelector("title");
    if (titleElement) {
      observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
    }

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
