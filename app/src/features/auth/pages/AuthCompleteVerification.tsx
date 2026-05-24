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

const FaceVerification = lazy(() =>
  import("@/features/auth/face-verification/FaceVerification").then((m) => ({ default: m.FaceVerification })),
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
        if (!registered.trialEligible || registered.facialMatch) {
          authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
        }
        navigate("/app", { replace: true });
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
        const registered = await registerUserFacialEmbedding(result.embedding);
        if (!registered.trialEligible || registered.facialMatch) {
          authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
        }
        navigate("/app", { replace: true });
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
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        {phase === "checking" ? "Verificando cadastro…" : "Concluindo verificação…"}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando verificação…</p>}>
        <FaceVerification
          open
          onClose={() => void handleClose()}
          onVerified={(result) => void handleVerified(result)}
        />
      </Suspense>
    </div>
  );
}
