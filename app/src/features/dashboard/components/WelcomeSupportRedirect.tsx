import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { isDefaultAppLandingPath, SUPPORT_HOME_PATH } from "@/lib/welcomeSupport";

/** Redireciona contas novas para Suporte na primeira entrada (flag no banco, sobrevive limpeza de cache). */
export function WelcomeSupportRedirect() {
  const { shop, loading } = useDashboardShop();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !shop?.welcome_support_pending) return;
    if (location.pathname === SUPPORT_HOME_PATH) return;
    if (!isDefaultAppLandingPath(location.pathname)) return;

    navigate(SUPPORT_HOME_PATH, { replace: true });
  }, [loading, shop?.welcome_support_pending, location.pathname, navigate]);

  return null;
}
