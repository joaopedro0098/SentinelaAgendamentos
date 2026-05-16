import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/guards/RequireAuth";
import { RequireAdmin } from "@/components/guards/RequireAdmin";

import HomePage from "@/features/landing/pages/HomePage";
import PlanosPage from "@/features/landing/pages/PlanosPage";
import PoliticaPrivacidadePage from "@/features/landing/pages/PoliticaPrivacidadePage";
import TermosServicoPage from "@/features/landing/pages/TermosServicoPage";

import ChatPage from "@/features/chat/pages/ChatPage";

import LoginPage from "@/features/auth/pages/Login";
import SignupPage from "@/features/auth/pages/Signup";
import RecoverPage from "@/features/auth/pages/Recover";
import ResetPasswordPage from "@/features/auth/pages/ResetPassword";
import AuthCallbackPage from "@/features/auth/pages/AuthCallback";

import AppLayout from "@/features/dashboard/pages/AppLayout";
import ConversationsListPage from "@/features/dashboard/pages/ConversationsList";
import ConversationViewPage from "@/features/dashboard/pages/ConversationView";
import SettingsPage from "@/features/dashboard/pages/Settings";

import AdminPanelPage from "@/features/admin/pages/AdminPanelPage";

import NotFoundPage from "@/pages/NotFound";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/planos" element={<PlanosPage />} />
      <Route path="/politica-de-privacidade" element={<PoliticaPrivacidadePage />} />
      <Route path="/termos-de-servico" element={<TermosServicoPage />} />

      <Route path="/c/:slug" element={<ChatPage />} />

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
        <Route index element={<ConversationsListPage />} />
        <Route path="c/:id" element={<ConversationViewPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminPanelPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
