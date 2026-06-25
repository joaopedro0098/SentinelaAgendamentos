import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDashboardShop } from "@/providers/DashboardShopProvider";
import { isStandalonePwa } from "@/lib/pwaInstall";
import {
  AGENDAMENTOS_HOME_PATH,
  hasPanelSessionStarted,
  isLegacyPwaColdStartSettingsPath,
  markPanelSessionStarted,
} from "@/lib/welcomeSupport";

/** PWA reaberto: abre em Agendamentos; contas novas seguem para Suporte via WelcomeSupportRedirect. */
export function PwaColdStartRedirect() {
  const { loading } = useDashboardShop();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    const hadSession = hasPanelSessionStarted();
    markPanelSessionStarted();

    if (hadSession) return;
    if (!isStandalonePwa()) return;
    if (!isLegacyPwaColdStartSettingsPath(location.pathname)) return;

    navigate(AGENDAMENTOS_HOME_PATH, { replace: true });
  }, [loading, location.pathname, navigate]);

  return null;
}
