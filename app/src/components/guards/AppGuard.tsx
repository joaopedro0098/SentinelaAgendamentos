import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canSkipFaceVerification, userNeedsFaceVerification } from "@/features/auth/face-verification/facialVerificationStatus";
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

function canSkipFaceCheck(userId?: string | null) {
  return canSkipFaceVerification(userId);
}

function initialBootState(): BootState {
  if (!hasStoredAuthSession()) return "login";
  if (canSkipFaceCheck()) return "ready";
  return "checking";
}

export function AppGuard({ children }: Props) {
  const { session, loading: authLoading } = useAuth();
  const location = useLocation();
  const [boot, setBoot] = useState<BootState>(initialBootState);
  const verifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      verifiedUserIdRef.current = null;
      setBoot("login");
      return;
    }

    const userId = session.user.id;
    if (verifiedUserIdRef.current === userId) {
      setBoot("ready");
      return;
    }

    if (canSkipFaceCheck(userId)) {
      verifiedUserIdRef.current = userId;
      setBoot("ready");
      return;
    }

    let active = true;
    setBoot("checking");

    void userNeedsFaceVerification(userId)
      .then((needsFace) => {
        if (!active) return;
        if (needsFace) {
          verifiedUserIdRef.current = null;
          setBoot("face");
          return;
        }
        verifiedUserIdRef.current = userId;
        setBoot("ready");
      })
      .catch(() => {
        if (!active) return;
        verifiedUserIdRef.current = userId;
        setBoot("ready");
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
