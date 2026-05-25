import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { authInfoToast } from "@/features/auth/lib/authToast";
import {
  FACIAL_TRIAL_BLOCKED_MESSAGE,
  registerUserFacialEmbedding,
  userNeedsFaceVerification,
} from "@/features/auth/face-verification/facialRecognitionController";
import {
  clearPendingFaceEmbedding,
  loadPendingFaceEmbedding,
} from "@/features/auth/face-verification/pendingFaceStorage";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    let active = true;

    async function finishAuth() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session) {
        navigate("/login", { replace: true });
        return;
      }

      const pending = loadPendingFaceEmbedding(data.session.user.email ?? undefined);
      if (pending) {
        try {
          const registered = await registerUserFacialEmbedding(pending.embedding);
          clearPendingFaceEmbedding();
          if (!registered.trialEligible || registered.facialMatch) {
            authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
          }
        } catch {
          clearPendingFaceEmbedding();
        }
      }

      const isSignupFlow = searchParams.get("flow") === "signup";
      if (isSignupFlow) {
        const needsFace = await userNeedsFaceVerification();
        if (!active) return;
        if (needsFace) {
          navigate("/auth/complete-verification", { replace: true });
          return;
        }
      }

      navigate("/app", { replace: true });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || handled) return;
      setHandled(true);
      void finishAuth();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !handled) {
        setHandled(true);
        void finishAuth();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, handled, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Concluindo login…
    </div>
  );
}
