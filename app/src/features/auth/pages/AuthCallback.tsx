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
import {
  clearPendingFaceEmbedding,
  loadPendingFaceEmbedding,
} from "@/features/auth/face-verification/pendingFaceStorage";
import {
  consumeAuthCallbackUrl,
  urlHasPendingAuthCallback,
  waitForAuthSession,
} from "@/features/auth/lib/authCallbackHandler";

export default function AuthCallback() {
  const navigate = useNavigate();
  const navigatedRef = useRef(false);

  useEffect(() => {
    let active = true;

    function go(path: string) {
      if (!active || navigatedRef.current) return;
      navigatedRef.current = true;
      navigate(path, { replace: true });
    }

    async function finishAuth() {
      const hadCallbackParams = urlHasPendingAuthCallback();
      if (hadCallbackParams) {
        await consumeAuthCallbackUrl();
      }

      const session =
        (await supabase.auth.getSession()).data.session ??
        (hadCallbackParams ? await waitForAuthSession() : null);

      if (!active) return;

      if (!session) {
        go("/login");
        return;
      }

      const userId = session.user.id;

      if (canSkipFaceVerification(userId)) {
        markFaceVerificationComplete(userId);
        go(getBarberPostLoginPath());
        const pending = loadPendingFaceEmbedding(session.user.email ?? undefined);
        if (pending) {
          void registerUserFacialEmbedding(pending.embedding)
            .then(() => clearPendingFaceEmbedding())
            .catch(() => clearPendingFaceEmbedding());
        }
        return;
      }

      const pending = loadPendingFaceEmbedding(session.user.email ?? undefined);
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
        go("/auth/complete-verification");
        return;
      }

      markFaceVerificationComplete(userId);
      go(getBarberPostLoginPath());
    }

    void finishAuth();

    return () => {
      active = false;
    };
  }, [navigate]);

  return <AppBootSkeleton />;
}
