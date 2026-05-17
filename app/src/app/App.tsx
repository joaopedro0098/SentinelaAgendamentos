import { BrowserRouter } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeFromRoute } from "@/components/theme/ThemeFromRoute";
import { AppRouter } from "@/app/router";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <AuthProvider>
        <ThemeFromRoute />
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
