import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/guards/RequireAuth";
import { RequireFaceVerification } from "@/components/guards/RequireFaceVerification";
import { MarketingLayout } from "@/features/landing/layout/MarketingLayout";
import HomePage from "@/features/landing/pages/HomePage";
import PlanosPage from "@/features/landing/pages/PlanosPage";
import PoliticaPrivacidadePage from "@/features/landing/pages/PoliticaPrivacidadePage";
import TermosServicoPage from "@/features/landing/pages/TermosServicoPage";

import PublicAgendaLayout from "@/features/agenda/pages/PublicAgendaLayout";
import PublicBookingHub from "@agenda/pages/PublicBookingHub";
import PublicBookingPage from "@/features/agenda/pages/PublicBookingPage";
import MeusAgendamentosPage from "@agenda/pages/MeusAgendamentos";
import ConfirmAppointmentPage from "@/features/agenda/pages/ConfirmAppointmentPage";

import LoginPage from "@/features/auth/pages/Login";
import SignupPage from "@/features/auth/pages/Signup";
import RecoverPage from "@/features/auth/pages/Recover";
import ResetPasswordPage from "@/features/auth/pages/ResetPassword";
import ResetPasswordSuccessPage from "@/features/auth/pages/ResetPasswordSuccess";
import AuthCallbackPage from "@/features/auth/pages/AuthCallback";
import AdminPage from "@/features/dashboard/pages/AdminPage";
import AuthCompleteVerificationPage from "@/features/auth/pages/AuthCompleteVerification";
import VerifyEmailSignupPage from "@/features/auth/pages/VerifyEmailSignup";
import { RequireAdmin } from "@/components/guards/RequireAdmin";

import AppLayout from "@/features/dashboard/pages/AppLayout";
import SettingsPage from "@/features/dashboard/pages/Settings";
import PerfilPage from "@/features/dashboard/pages/PerfilPage";
import AssinarCartaoPage from "@/features/billing/pages/AssinarCartaoPage";
import AgendarPage from "@/features/dashboard/pages/AgendarPage";
import AgendamentosPage from "@/features/dashboard/pages/AgendamentosPage";

import NotFoundPage from "@/pages/NotFound";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/planos" element={<PlanosPage />} />
        <Route path="/politica-de-privacidade" element={<PoliticaPrivacidadePage />} />
        <Route path="/termos-de-servico" element={<TermosServicoPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/signup/verify-email" element={<VerifyEmailSignupPage />} />
        <Route path="/recover" element={<RecoverPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-password/success" element={<ResetPasswordSuccessPage />} />
      </Route>

      <Route path="/agendar/:slug" element={<PublicAgendaLayout />}>
        <Route index element={<PublicBookingHub />} />
        <Route path="agendar" element={<PublicBookingPage />} />
        <Route path="meus-agendamentos" element={<MeusAgendamentosPage />} />
      </Route>
      <Route path="/confirmar-agendamento/:token" element={<ConfirmAppointmentPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/auth/complete-verification"
        element={
          <RequireAuth>
            <AuthCompleteVerificationPage />
          </RequireAuth>
        }
      />

      <Route
        path="/app"
        element={
          <RequireAuth>
            <RequireFaceVerification>
              <AppLayout />
            </RequireFaceVerification>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="settings" replace />} />
        <Route path="agendar" element={<AgendarPage />} />
        <Route path="agendamentos" element={<AgendamentosPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="perfil" element={<PerfilPage />} />
        <Route path="perfil/assinar-cartao" element={<AssinarCartaoPage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
