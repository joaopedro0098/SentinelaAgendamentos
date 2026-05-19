import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/guards/RequireAuth";
import HomePage from "@/features/landing/pages/HomePage";
import PlanosPage from "@/features/landing/pages/PlanosPage";
import PoliticaPrivacidadePage from "@/features/landing/pages/PoliticaPrivacidadePage";
import TermosServicoPage from "@/features/landing/pages/TermosServicoPage";

import PublicBookingRoute from "@/features/agenda/pages/PublicBookingRoute";
import MeusAgendamentosRoute from "@/features/agenda/pages/MeusAgendamentosRoute";

import LoginPage from "@/features/auth/pages/Login";
import SignupPage from "@/features/auth/pages/Signup";
import RecoverPage from "@/features/auth/pages/Recover";
import ResetPasswordPage from "@/features/auth/pages/ResetPassword";
import AuthCallbackPage from "@/features/auth/pages/AuthCallback";

import AppLayout from "@/features/dashboard/pages/AppLayout";
import SettingsPage from "@/features/dashboard/pages/Settings";
import PerfilPage from "@/features/dashboard/pages/PerfilPage";
import AgendarPage from "@/features/dashboard/pages/AgendarPage";
import AgendamentosPage from "@/features/dashboard/pages/AgendamentosPage";

import NotFoundPage from "@/pages/NotFound";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/planos" element={<PlanosPage />} />
      <Route path="/politica-de-privacidade" element={<PoliticaPrivacidadePage />} />
      <Route path="/termos-de-servico" element={<TermosServicoPage />} />

      <Route path="/agendar/:slug" element={<PublicBookingRoute />} />
      <Route path="/agendar/:slug/meus" element={<MeusAgendamentosRoute />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/recover" element={<RecoverPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="agendar" replace />} />
        <Route path="agendar" element={<AgendarPage />} />
        <Route path="agendamentos" element={<AgendamentosPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="perfil" element={<PerfilPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
