import { useLocation } from "react-router-dom";
import { KeepAliveRoutes } from "@/components/layout/KeepAliveRoutes";
import { RequireAdmin } from "@/components/guards/RequireAdmin";
import AgendarPage from "@/features/dashboard/pages/AgendarPage";
import AgendamentosPage from "@/features/dashboard/pages/AgendamentosPage";
import PacientesPage from "@/features/dashboard/pages/PacientesPage";
import ProfissionaisPage from "@/features/dashboard/pages/ProfissionaisPage";
import SettingsPage from "@/features/dashboard/pages/Settings";
import PerfilPage from "@/features/dashboard/pages/PerfilPage";
import AssinarCartaoPage from "@/features/billing/pages/AssinarCartaoPage";
import SupportPage from "@/features/dashboard/pages/SupportPage";
import RelatoriosPage from "@/features/dashboard/pages/RelatoriosPage";
import PagamentosPage from "@/features/dashboard/pages/PagamentosPage";
import AdminPage from "@/features/dashboard/pages/AdminPage";

const ROUTES = [
  { path: "/app/agendar", Component: AgendarPage },
  { path: "/app/agendamentos", Component: AgendamentosPage },
  { path: "/app/pacientes", Component: PacientesPage },
  { path: "/app/profissionais", Component: ProfissionaisPage },
  { path: "/app/settings", Component: SettingsPage },
  { path: "/app/perfil/assinar-cartao", Component: AssinarCartaoPage },
  { path: "/app/perfil", Component: PerfilPage, exact: true },
  { path: "/app/pagamentos", Component: PagamentosPage },
  { path: "/app/relatorios", Component: RelatoriosPage },
  { path: "/app/suporte", Component: SupportPage },
  {
    path: "/app/admin",
    Component: AdminPage,
    wrap: (element) => <RequireAdmin>{element}</RequireAdmin>,
  },
] as const;

/** Página exibida ao entrar no painel — montada junto com o layout para evitar tela branca. */
const DEFAULT_PANEL_PATH = "/app/agendamentos";

export default function DashboardRoutes() {
  const { pathname } = useLocation();

  return (
    <KeepAliveRoutes
      pathname={pathname}
      routes={[...ROUTES]}
      prefetchPaths={[DEFAULT_PANEL_PATH]}
    />
  );
}
