import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BARBER_PWA_HOME, isStandalonePwa, isBarberPwaMarketingPath } from "@/lib/pwaInstall";

/** No app instalado, barbeiro logado não passa pela landing — vai direto ao painel. */
export function BarberPwaEntryRedirect() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading || !isStandalonePwa() || !session) return null;
  if (!isBarberPwaMarketingPath(location.pathname)) return null;

  return <Navigate to={BARBER_PWA_HOME} replace />;
}
