import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/guards/RequireAuth";
import { AppGuard } from "@/components/guards/AppGuard";
import { MarketingLayout } from "@/features/landing/layout/MarketingLayout";
import { DashboardPageSkeleton, AppBootSkeleton } from "@/components/layout/AppBootSkeleton";
import { DashboardShopProvider } from "@/providers/DashboardShopProvider";

const HomePage = lazy(() => import("@/features/landing/pages/HomePage"));
const PlanosPage = lazy(() => import("@/features/landing/pages/PlanosPage"));
const PoliticaPrivacidadePage = lazy(() => import("@/features/landing/pages/PoliticaPrivacidadePage"));
const TermosServicoPage = lazy(() => import("@/features/landing/pages/TermosServicoPage"));

const PublicAgendaLayout = lazy(() => import("@/features/agenda/pages/PublicAgendaLayout"));
const PublicBookingHub = lazy(() => import("@agenda/pages/PublicBookingHub"));
const PublicBookingPage = lazy(() => import("@/features/agenda/pages/PublicBookingPage"));
const MeusAgendamentosPage = lazy(() => import("@agenda/pages/MeusAgendamentos"));
const ConfirmAppointmentPage = lazy(() => import("@/features/agenda/pages/ConfirmAppointmentPage"));

const LoginPage = lazy(() => import("@/features/auth/pages/Login"));
const SignupPage = lazy(() => import("@/features/auth/pages/Signup"));
const RecoverPage = lazy(() => import("@/features/auth/pages/Recover"));
const ResetPasswordPage = lazy(() => import("@/features/auth/pages/ResetPassword"));
const ResetPasswordSuccessPage = lazy(() => import("@/features/auth/pages/ResetPasswordSuccess"));
const AuthCallbackPage = lazy(() => import("@/features/auth/pages/AuthCallback"));
const AuthCompleteVerificationPage = lazy(() => import("@/features/auth/pages/AuthCompleteVerification"));
const VerifyEmailSignupPage = lazy(() => import("@/features/auth/pages/VerifyEmailSignup"));

const AppLayout = lazy(() => import("@/features/dashboard/pages/AppLayout"));
const SettingsPage = lazy(() => import("@/features/dashboard/pages/Settings"));
const PerfilPage = lazy(() => import("@/features/dashboard/pages/PerfilPage"));
const AssinarCartaoPage = lazy(() => import("@/features/billing/pages/AssinarCartaoPage"));
const AgendarPage = lazy(() => import("@/features/dashboard/pages/AgendarPage"));
const AgendamentosPage = lazy(() => import("@/features/dashboard/pages/AgendamentosPage"));
const AdminPage = lazy(() => import("@/features/dashboard/pages/AdminPage"));

const NotFoundPage = lazy(() => import("@/pages/NotFound"));
const RequireAdmin = lazy(() =>
  import("@/components/guards/RequireAdmin").then((m) => ({ default: m.RequireAdmin })),
);

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground text-sm">
      Carregando…
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
            <AppGuard>
              <DashboardShopProvider>
                <Suspense fallback={<AppBootSkeleton />}>
                  <AppLayout />
                </Suspense>
              </DashboardShopProvider>
            </AppGuard>
          }
        >
          <Route index element={<Navigate to="settings" replace />} />
          <Route
            path="agendar"
            element={
              <Suspense fallback={<DashboardPageSkeleton />}>
                <AgendarPage />
              </Suspense>
            }
          />
          <Route
            path="agendamentos"
            element={
              <Suspense fallback={<DashboardPageSkeleton />}>
                <AgendamentosPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<DashboardPageSkeleton />}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route
            path="perfil"
            element={
              <Suspense fallback={<DashboardPageSkeleton />}>
                <PerfilPage />
              </Suspense>
            }
          />
          <Route
            path="perfil/assinar-cartao"
            element={
              <Suspense fallback={<DashboardPageSkeleton />}>
                <AssinarCartaoPage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <Suspense fallback={<DashboardPageSkeleton />}>
                <RequireAdmin>
                  <AdminPage />
                </RequireAdmin>
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
