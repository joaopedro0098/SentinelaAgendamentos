import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireAdmin } from "@/components/RequireAdmin";

import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ChatClient from "./pages/ChatClient.tsx";
import Login from "./pages/auth/Login.tsx";
import Signup from "./pages/auth/Signup.tsx";
import Recover from "./pages/auth/Recover.tsx";
import ResetPassword from "./pages/auth/ResetPassword.tsx";
import AuthCallback from "./pages/auth/AuthCallback.tsx";
import AppLayout from "./pages/app/AppLayout.tsx";
import ConversationsList from "./pages/app/ConversationsList.tsx";
import ConversationView from "./pages/app/ConversationView.tsx";
import Settings from "./pages/app/Settings.tsx";
import AdminPanel from "./pages/admin/AdminPanel.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/c/:slug" element={<ChatClient />} />

            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/recover" element={<Recover />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            <Route
              path="/app"
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<ConversationsList />} />
              <Route path="c/:id" element={<ConversationView />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <RequireAdmin>
                    <AdminPanel />
                  </RequireAdmin>
                </RequireAuth>
              }
            />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
