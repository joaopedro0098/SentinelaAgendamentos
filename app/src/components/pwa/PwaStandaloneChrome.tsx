import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isClientPwaPath } from "@/lib/clientPwaManifest";
import { applyPwaWindowTitle, isStandalonePwa } from "@/lib/pwaInstall";

function applyClientPwaWindowTitle() {
  const title =
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content")?.trim() ||
    "Agendar";
  if (document.title !== title) {
    document.title = title;
  }
}

/** Garante título fixo e comportamento de app nativo quando instalado. */
export function PwaStandaloneChrome() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isStandalonePwa()) return;

    if (isClientPwaPath(pathname)) {
      applyClientPwaWindowTitle();

      const observer = new MutationObserver(() => {
        applyClientPwaWindowTitle();
      });

      const titleElement = document.querySelector("title");
      if (titleElement) {
        observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
      }

      return () => observer.disconnect();
    }

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
