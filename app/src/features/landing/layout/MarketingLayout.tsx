import { useLocation } from "react-router-dom";
import Navbar from "@/features/landing/components/Navbar";
import { AnimatedMarketingOutlet } from "@/components/layout/PageTransition";
import { AuthLegalFooter } from "@/features/auth/components/AuthLegalFooter";

const AUTH_PATHS = new Set([
  "/login",
  "/signup",
  "/signup/verify-email",
  "/recover",
  "/reset-password",
  "/reset-password/success",
]);

export function MarketingLayout() {
  const { pathname } = useLocation();
  const showAuthLegalFooter = AUTH_PATHS.has(pathname);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden flex flex-col">
      <Navbar />
      <AnimatedMarketingOutlet />
      {showAuthLegalFooter ? <AuthLegalFooter /> : null}
    </div>
  );
}
