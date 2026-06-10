import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { authInfoToast } from "@/features/auth/lib/authToast";
import {
  FACIAL_TRIAL_BLOCKED_MESSAGE,
  registerUserFacialEmbedding,
} from "@/features/auth/face-verification/facialRecognitionController";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";
import {
  clearPendingFaceEmbedding,
  loadPendingFaceEmbedding,
} from "@/features/auth/face-verification/pendingFaceStorage";
import { markFaceVerificationComplete } from "@/features/auth/face-verification/facialVerificationStatus";
import { AppBootSkeleton } from "@/components/layout/AppBootSkeleton";
import { getBarberPostLoginPath } from "@/lib/pwaInstall";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";

const FaceVerificationFlow = lazy(() =>
  import("@/features/auth/face-verification/FaceVerificationFlow").then((m) => ({
    default: m.FaceVerificationFlow,
  })),
);

type Phase = "checking" | "verify" | "submitting";

export default function AuthCompleteVerification() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    let active = true;

    async function tryPending() {
      const { data } = await supabase.auth.getUser();
      const pending = loadPendingFaceEmbedding(data.user?.email ?? undefined);
      if (!pending) {
        if (active) setPhase("verify");
        return;
      }

      if (active) setPhase("submitting");
      try {
        const registered = await registerUserFacialEmbedding(pending.embedding);
        clearPendingFaceEmbedding();
        clearSubscriptionCache();
        markFaceVerificationComplete(data.user?.id);
        if (!registered.trialEligible || registered.facialMatch) {
          authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
        }
        navigate(getBarberPostLoginPath(), { replace: true });
      } catch {
        clearPendingFaceEmbedding();
        authInfoToast("Não foi possível concluir a verificação. Refaça o processo.");
        if (active) setPhase("verify");
      }
    }

    void tryPending();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleVerified = useCallback(
    async (result: FacialVerificationResult) => {
      setPhase("submitting");
      try {
        const { data: userData } = await supabase.auth.getUser();
        const registered = await registerUserFacialEmbedding(result.embedding);
        clearSubscriptionCache();
        markFaceVerificationComplete(userData.user?.id);
        if (!registered.trialEligible || registered.facialMatch) {
          authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
        }
        navigate(getBarberPostLoginPath(), { replace: true });
      } catch {
        authInfoToast("Não foi possível concluir a verificação. Tente novamente.");
        setPhase("verify");
      }
    },
    [navigate],
  );

  async function handleClose() {
    await supabase.auth.signOut();
    navigate("/signup", { replace: true });
  }

  if (phase === "checking" || phase === "submitting") {
    return <AppBootSkeleton />;
  }

  return (
    <Suspense fallback={<AppBootSkeleton />}>
      <FaceVerificationFlow
        open
        orientationVariant="page"
        onClose={() => void handleClose()}
        onVerified={(result) => void handleVerified(result)}
      />
    </Suspense>
  );
}
