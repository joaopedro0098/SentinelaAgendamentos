import { Navigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, loadingAdmin } = useIsAdmin();

  if (loadingAdmin) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
