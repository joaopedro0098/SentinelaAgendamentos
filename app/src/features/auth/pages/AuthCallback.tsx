import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { authInfoToast } from "@/features/auth/lib/authToast";
import {
  FACIAL_TRIAL_BLOCKED_MESSAGE,
  registerUserFacialEmbedding,
} from "@/features/auth/face-verification/facialRecognitionController";
import { userNeedsFaceVerification, markFaceVerificationComplete, canSkipFaceVerification } from "@/features/auth/face-verification/facialVerificationStatus";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";
import { getBarberPostLoginPath } from "@/lib/pwaInstall";
import { AppBootSkeleton } from "@/components/layout/AppBootSkeleton";
import { isEmailVerified } from "@/features/auth/lib/signupCompletion";
import {
  clearPendingFaceEmbedding,
  loadPendingFaceEmbedding,
} from "@/features/auth/face-verification/pendingFaceStorage";

export default function AuthCallback() {
  const navigate = useNavigate();
  const finishedRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function finishAuth() {
      if (!active || finishedRef.current) return;
      finishedRef.current = true;

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session) {
        navigate("/login", { replace: true });
        return;
      }

      const userId = data.session.user.id;

      if (!isEmailVerified(data.session.user)) {
        navigate("/signup/verify-email", { replace: true });
        return;
      }

      // Entrada rápida: quem já verificou o rosto não espera RPC nem embedding pendente.
      if (canSkipFaceVerification(userId)) {
        markFaceVerificationComplete(userId);
        navigate(getBarberPostLoginPath(), { replace: true });
        const pending = loadPendingFaceEmbedding(data.session.user.email ?? undefined);
        if (pending) {
          void registerUserFacialEmbedding(pending.embedding)
            .then(() => clearPendingFaceEmbedding())
            .catch(() => clearPendingFaceEmbedding());
        }
        return;
      }

      const pending = loadPendingFaceEmbedding(data.session.user.email ?? undefined);
      if (pending) {
        try {
          const registered = await registerUserFacialEmbedding(pending.embedding);
          clearPendingFaceEmbedding();
          clearSubscriptionCache();
          markFaceVerificationComplete(userId);
          if (!registered.trialEligible || registered.facialMatch) {
            authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
          }
        } catch {
          clearPendingFaceEmbedding();
        }
      }

      const needsFace = await userNeedsFaceVerification(userId);
      if (!active) return;
      if (needsFace) {
        navigate("/auth/complete-verification", { replace: true });
        return;
      }

      markFaceVerificationComplete(userId);
      navigate(getBarberPostLoginPath(), { replace: true });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        void finishAuth();
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void finishAuth();
    });

    const timeout = window.setTimeout(() => {
      if (!active || finishedRef.current) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (finishedRef.current) return;
        if (data.session) {
          void finishAuth();
          return;
        }
        navigate("/login", { replace: true });
      });
    }, 10000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return <AppBootSkeleton />;
}
