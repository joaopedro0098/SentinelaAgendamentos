import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { userNeedsFaceVerification } from "@/features/auth/face-verification/facialRecognitionController";

type Props = {
  children: React.ReactNode;
};

export function RequireFaceVerification({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [needsFace, setNeedsFace] = useState(false);

  useEffect(() => {
    let active = true;

    void userNeedsFaceVerification().then((pending) => {
      if (active) setNeedsFace(pending);
    }).finally(() => {
      if (active) setChecking(false);
    });

    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Carregando…
      </div>
    );
  }

  if (needsFace) {
    return <Navigate to="/auth/complete-verification" replace />;
  }

  return <>{children}</>;
}
