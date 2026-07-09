import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "@/features/landing/components/Navbar";
import { AnimatedMarketingOutlet } from "@/components/layout/PageTransition";
import { AuthLegalFooter } from "@/features/auth/components/AuthLegalFooter";
import {
  MARKETING_PAGE_TITLES,
  MARKETING_PAGE_DESCRIPTIONS,
  NOINDEX_MARKETING_PATHS,
} from "@/lib/marketingSeo";

const AUTH_PATHS = new Set([
  "/login",
  "/signup",
  "/signup/confirmar-codigo",
  "/recover",
  "/reset-password",
  "/reset-password/success",
]);

export function MarketingLayout() {
  const { pathname } = useLocation();
  const showAuthLegalFooter = AUTH_PATHS.has(pathname);

  useEffect(() => {
    const title = MARKETING_PAGE_TITLES[pathname];
    if (title) document.title = title;

    const description = MARKETING_PAGE_DESCRIPTIONS[pathname];
    if (description) {
      let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = description;
    }

    let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;

    if (NOINDEX_MARKETING_PATHS.has(pathname)) {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "noindex, follow";
      return;
    }

    if (pathname === "/") {
      if (!robots) {
        robots = document.createElement("meta");
        robots.name = "robots";
        document.head.appendChild(robots);
      }
      robots.content = "index, follow";
    }
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden flex flex-col">
      <Navbar />
      <AnimatedMarketingOutlet />
      {showAuthLegalFooter ? <AuthLegalFooter /> : null}
    </div>
  );
}
