import { BrowserRouter } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeFromRoute } from "@/components/theme/ThemeFromRoute";
import { AppRouter } from "@/app/router";
import { PwaInstallProvider } from "@/providers/PwaInstallProvider";
import { BarberPwaEntryRedirect } from "@/components/pwa/BarberPwaEntryRedirect";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <PwaInstallProvider>
        <AuthProvider>
          <ThemeFromRoute />
          <BarberPwaEntryRedirect />
          <AppRouter />
        </AuthProvider>
      </PwaInstallProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
