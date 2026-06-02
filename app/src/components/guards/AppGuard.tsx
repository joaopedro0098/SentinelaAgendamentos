import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { userNeedsFaceVerification } from "@/features/auth/face-verification/facialVerificationStatus";
import { AppBootSkeleton } from "@/components/layout/AppBootSkeleton";

type BootState = "checking" | "login" | "face" | "ready";

type Props = {
  children: React.ReactNode;
};

function hasStoredAuthSession() {
  try {
    return Object.keys(localStorage).some(
      (key) => key.startsWith("sb-") && key.endsWith("-auth-token") && localStorage.getItem(key),
    );
  } catch {
    return false;
  }
}

export function AppGuard({ children }: Props) {
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();
  const [boot, setBoot] = useState<BootState>(() => (hasStoredAuthSession() ? "checking" : "login"));

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setBoot("login");
      return;
    }

    let active = true;
    setBoot("checking");

    void userNeedsFaceVerification()
      .then((needsFace) => {
        if (!active) return;
        setBoot(needsFace ? "face" : "ready");
      })
      .catch(() => {
        if (active) setBoot("ready");
      });

    return () => {
      active = false;
    };
  }, [authLoading, session?.user?.id]);

  if (authLoading || boot === "checking") {
    return <AppBootSkeleton />;
  }

  if (boot === "login") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (boot === "face") {
    return <Navigate to="/auth/complete-verification" replace />;
  }

  return <>{children}</>;
}
