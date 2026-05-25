import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

type Props = {
  children: React.ReactNode;
};

export function RequireAuth({ children }: Props) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>;
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
