import { Navigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { RequireAuth } from "@/components/guards/RequireAuth";

type Props = {
  children: React.ReactNode;
};

export function RequireAdmin({ children }: Props) {
  const { info, loading } = useSubscription();

  return (
    <RequireAuth>
      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>
      ) : info?.is_admin ? (
        children
      ) : (
        <Navigate to="/app/settings" replace />
      )}
    </RequireAuth>
  );
}
