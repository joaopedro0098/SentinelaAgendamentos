import { Navigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";

type Props = {
  children: React.ReactNode;
};

export function RequireAdmin({ children }: Props) {
  const { info, loading } = useSubscription();

  if (loading) {
    return null;
  }

  if (!info?.is_admin) {
    return <Navigate to="/app/settings" replace />;
  }

  return <>{children}</>;
}
