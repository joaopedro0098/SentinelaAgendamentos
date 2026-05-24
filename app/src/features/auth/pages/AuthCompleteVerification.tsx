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

export default function AuthCompleteVerification() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const pending = loadPendingFaceEmbedding();
    if (!pending) return;
    setSubmitting(true);
    void registerUserFacialEmbedding(pending.embedding)
      .then((registered) => {
        clearPendingFaceEmbedding();
        if (!registered.trialEligible || registered.facialMatch) {
          authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
        }
        navigate("/app", { replace: true });
      })
      .catch(() => {
        clearPendingFaceEmbedding();
        authInfoToast("Não foi possível concluir a verificação. Refaça o processo.");
        setSubmitting(false);
      });
  }, [navigate]);

  const handleVerified = useCallback(
    async (result: FacialVerificationResult) => {
      setSubmitting(true);
      try {
        const registered = await registerUserFacialEmbedding(result.embedding);
        if (!registered.trialEligible || registered.facialMatch) {
          authInfoToast(FACIAL_TRIAL_BLOCKED_MESSAGE);
        }
        setOpen(false);
        navigate("/app", { replace: true });
      } catch {
        authInfoToast("Não foi possível concluir a verificação. Tente novamente.");
        setSubmitting(false);
      }
    },
    [navigate],
  );

  async function handleClose() {
    await supabase.auth.signOut();
    navigate("/signup", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando verificação…</p>}>
        <FaceVerification
          open={open && !submitting}
          onClose={() => void handleClose()}
          onVerified={(result) => void handleVerified(result)}
        />
      </Suspense>
    </div>
  );
}
