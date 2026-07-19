import { Navigate, useLocation } from "react-router-dom";
import { KeepAliveRoutes } from "@/components/layout/KeepAliveRoutes";
import { RequireAdmin } from "@/components/guards/RequireAdmin";
import AgendarPage from "@/features/dashboard/pages/AgendarPage";
import AgendamentosPage from "@/features/dashboard/pages/AgendamentosPage";
import PacientesPage from "@/features/dashboard/pages/PacientesPage";
import ProfissionaisPage from "@/features/dashboard/pages/ProfissionaisPage";
import SettingsPage from "@/features/dashboard/pages/Settings";
import ConnectPage from "@/features/dashboard/pages/ConnectPage";
import IntegracoesPage from "@/features/dashboard/pages/IntegracoesPage";
import PerfilPage from "@/features/dashboard/pages/PerfilPage";
import {
  AssinarPlanoCartaoPage,
  AssinarPlanoPixPage,
} from "@/features/billing/pages/AssinarPlanoPage";
import AtualizarPagamentoPage from "@/features/billing/pages/AtualizarPagamentoPage";
import SupportPage from "@/features/dashboard/pages/SupportPage";
import RelatoriosPage from "@/features/dashboard/pages/RelatoriosPage";
import PagamentosPage from "@/features/dashboard/pages/PagamentosPage";
import AdminPage from "@/features/dashboard/pages/AdminPage";

function LegacyPerfilRedirect() {
  return <Navigate to="/app/perfil" replace />;
}

const ROUTES = [
  { path: "/app/agendar", Component: AgendarPage },
  { path: "/app/agendamentos", Component: AgendamentosPage },
  { path: "/app/pacientes", Component: PacientesPage },
  { path: "/app/profissionais", Component: ProfissionaisPage },
  { path: "/app/connect", Component: ConnectPage },
  { path: "/app/integracoes", Component: IntegracoesPage },
  { path: "/app/settings", Component: SettingsPage },
  { path: "/app/perfil/assinatura/retorno", Component: LegacyPerfilRedirect },
  { path: "/app/perfil/assinar-plano/cartao", Component: AssinarPlanoCartaoPage },
  { path: "/app/perfil/assinar-plano/pix", Component: AssinarPlanoPixPage },
  { path: "/app/perfil/atualizar-pagamento", Component: AtualizarPagamentoPage },
  { path: "/app/perfil/assinar-cartao", Component: LegacyPerfilRedirect },
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
