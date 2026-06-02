import { Navigate, useLocation } from "react-router-dom";
import { KeepAliveRoutes } from "@/components/layout/KeepAliveRoutes";
import { RequireAdmin } from "@/components/guards/RequireAdmin";
import AgendarPage from "@/features/dashboard/pages/AgendarPage";
import AgendamentosPage from "@/features/dashboard/pages/AgendamentosPage";
import SettingsPage from "@/features/dashboard/pages/Settings";
import PerfilPage from "@/features/dashboard/pages/PerfilPage";
import AssinarCartaoPage from "@/features/billing/pages/AssinarCartaoPage";
import AdminPage from "@/features/dashboard/pages/AdminPage";

const ROUTES = [
  { path: "/app/agendar", Component: AgendarPage },
  { path: "/app/agendamentos", Component: AgendamentosPage },
  { path: "/app/settings", Component: SettingsPage },
  { path: "/app/perfil/assinar-cartao", Component: AssinarCartaoPage },
  { path: "/app/perfil", Component: PerfilPage, exact: true },
  {
    path: "/app/admin",
    Component: AdminPage,
    wrap: (element) => <RequireAdmin>{element}</RequireAdmin>,
  },
] as const;

export default function DashboardRoutes() {
  const { pathname } = useLocation();

  if (pathname === "/app" || pathname === "/app/") {
    return <Navigate to="/app/settings" replace />;
  }

  return <KeepAliveRoutes pathname={pathname} routes={[...ROUTES]} />;
}
