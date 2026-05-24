import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { userNeedsFaceVerification } from "@/features/auth/face-verification/facialRecognitionController";

type Props = {
  children: React.ReactNode;
  skipFaceCheck?: boolean;
};

export function RequireAuth({ children, skipFaceCheck = false }: Props) {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [facePending, setFacePending] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session || skipFaceCheck) {
      setFacePending(false);
      return;
    }
    let active = true;
    userNeedsFaceVerification().then((needs) => {
      if (active) setFacePending(needs);
    });
    return () => {
      active = false;
    };
  }, [session, skipFaceCheck]);

  if (loading || (session && !skipFaceCheck && facePending === null)) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Carregando…</div>;
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!skipFaceCheck && facePending) {
    return <Navigate to="/auth/complete-verification" replace />;
  }
  return <>{children}</>;
}
