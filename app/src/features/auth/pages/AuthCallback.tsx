import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { authInfoToast } from "@/features/auth/lib/authToast";
import { registerUserFacialEmbedding } from "@/features/auth/face-verification/facialRecognitionController";
import { FACIAL_TRIAL_BLOCKED_MESSAGE } from "@/lib/subscriptionMessages";
import {
  userNeedsFaceVerification,
  markFaceVerificationComplete,
  canSkipFaceVerification,
} from "@/features/auth/face-verification/facialVerificationStatus";
import { clearSubscriptionCache } from "@/providers/SubscriptionProvider";
import { getBarberPostLoginPath } from "@/lib/pwaInstall";
import { getPatientActivationSuccessPath, getPatientPostLoginPath } from "@/features/auth/lib/postLoginPaths";
import { finishPatientActivation } from "@/features/auth/lib/patientActivationFinish";
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
import { toast } from "@/hooks/use-toast";

function readOAuthFlowParams() {
  const url = new URL(window.location.href);
  return {
    flow: url.searchParams.get("flow"),
    token: url.searchParams.get("token"),
  };
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const navigatedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const { flow, token } = readOAuthFlowParams();

    function go(path: string) {
      if (!active || navigatedRef.current) return;
      navigatedRef.current = true;
      navigate(path, { replace: true });
    }

    async function finishProfessionalPath(userId: string, sessionEmail?: string | null) {
      if (canSkipFaceVerification(userId)) {
        markFaceVerificationComplete(userId);
        go(getBarberPostLoginPath());
        const pending = loadPendingFaceEmbedding(sessionEmail ?? undefined);
        if (pending) {
          void registerUserFacialEmbedding(pending.embedding)
            .then(() => clearPendingFaceEmbedding())
            .catch(() => clearPendingFaceEmbedding());
        }
        return;
      }

      const pending = loadPendingFaceEmbedding(sessionEmail ?? undefined);
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

      if (flow === "patient-activation" && token) {
        const result = await finishPatientActivation(token, userId);
        if (!result.ok) {
          toast({
            title: "Falha ao vincular paciente",
            description: result.error,
            variant: "destructive",
          });
          go(`/ativar-paciente?token=${encodeURIComponent(token)}`);
          return;
        }
        authInfoToast("Conta ativada com sucesso!");
        go(getPatientActivationSuccessPath(result.slug));
        return;
      }

      if (flow === "patient-login") {
        go(getPatientPostLoginPath());
        return;
      }

      await finishProfessionalPath(userId, session.user.email);
    }

    void finishAuth();

    return () => {
      active = false;
    };
  }, [navigate]);

  return <AppBootSkeleton />;
}
