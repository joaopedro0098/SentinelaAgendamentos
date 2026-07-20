import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ScanFace, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toUserFaceError } from "./faceEmbeddingService";
import { useCamera } from "./useCamera";
import { useLiveness } from "./useLiveness";
import {
  buildEmbeddingFromSnapshot,
  checkFacialTrialEligibility,
  type FacialVerificationProgress,
  type FacialVerificationResult,
} from "./facialRecognitionController";
import {
  FACE_CAMERA_CLIP_PATH,
  FaceCameraStageLayout,
} from "./FaceCameraStageLayout";

type Props = {
  open: boolean;
  onClose: () => void;
  onVerified: (result: FacialVerificationResult) => void;
};

export function FaceVerification({ open, onClose, onVerified }: Props) {
  const { videoRef, start, stop, captureFrame, ready, error: cameraError } = useCamera();
  const [processing, setProcessing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<FacialVerificationProgress>({
    stage: "camera",
    message: "Olhe para a câmera",
  });
  const [livenessActive, setLivenessActive] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const aliveRef = useRef(true);

  const finishVerification = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setProcessing(true);
    setLivenessActive(false);
    setFailed(null);
    setProgress({ stage: "embedding", message: "Finalizando verificação…" });

    try {
      const canvas = captureFrame();
      if (!canvas) throw new Error("Não foi possível capturar a imagem. Tente novamente.");

      const embedding = await buildEmbeddingFromSnapshot(canvas, setProgress);
      if (!aliveRef.current) return;

      setProgress({ stage: "checking", message: "Validando…" });
      const { trialEligible, facialMatch } = await checkFacialTrialEligibility(embedding);
      if (!aliveRef.current) return;

      stop();
      setProgress({ stage: "done", message: "Pronto ✅" });
      onVerified({ embedding, trialEligible, facialMatch });
    } catch (e) {
      if (!aliveRef.current) return;
      setFailed(toUserFaceError(e));
    } finally {
      if (aliveRef.current) setProcessing(false);
      finishingRef.current = false;
    }
  }, [captureFrame, stop, onVerified]);

  const handleLivenessComplete = useCallback(() => {
    void finishVerification();
  }, [finishVerification]);

  const { message } = useLiveness({
    key: attempt,
    video: ready ? videoRef.current : null,
    active: open && livenessActive && !processing && !failed,
    onComplete: handleLivenessComplete,
  });

  useEffect(() => {
    aliveRef.current = true;
    if (!open) {
      aliveRef.current = false;
      setLivenessActive(false);
      setProcessing(false);
      setFailed(null);
      finishingRef.current = false;
      stop();
      return;
    }
    setProgress({ stage: "camera", message: "Olhe para a câmera" });
    setFailed(null);
    finishingRef.current = false;
    void start().then(() => {
      if (aliveRef.current) setLivenessActive(true);
    });
    return () => {
      aliveRef.current = false;
      stop();
    };
  }, [open, start, stop, attempt]);

  useEffect(() => {
    if (livenessActive && !processing && !failed) {
      setProgress({ stage: "liveness", message });
    }
  }, [message, livenessActive, processing, failed]);

  const instructionMessage = failed
    ? null
    : processing
      ? progress.message
      : progress.stage === "liveness"
        ? message
        : progress.message;

  function handleRetry() {
    setFailed(null);
    setProcessing(false);
    finishingRef.current = false;
    setAttempt((n) => n + 1);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md glass rounded-3xl border border-border/60 shadow-soft overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          disabled={processing}
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-background/70 flex items-center justify-center"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-6 pb-3 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand text-white mb-2">
            <ScanFace className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-semibold">Verificação facial</h2>
        </div>

        <div className="px-6 pb-3 min-h-[5.5rem]">
          {failed ? (
            <div className="space-y-3 text-center">
              <p className="text-sm sm:text-base font-medium text-destructive leading-snug">{failed}</p>
              <Button type="button" className="w-full rounded-full" onClick={handleRetry}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              {instructionMessage && (
                <p className="text-center text-[clamp(1.375rem,5.5vw,1.875rem)] font-bold text-foreground leading-tight">
                  {instructionMessage}
                </p>
              )}
              {cameraError && <p className="mt-2 text-center text-sm text-destructive">{cameraError}</p>}
            </>
          )}
        </div>

        <FaceCameraStageLayout
          borderFailed={Boolean(failed)}
          video={
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
              style={{ clipPath: FACE_CAMERA_CLIP_PATH, WebkitClipPath: FACE_CAMERA_CLIP_PATH }}
              playsInline
              muted
            />
          }
          overlay={
            <>
              {!ready && !failed && (
                <div className="absolute inset-0 flex items-center justify-center bg-white">
                  <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--brand-green))]" />
                </div>
              )}

              {processing && !failed && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/75 gap-2">
                  <Loader2 className="w-7 h-7 animate-spin text-[hsl(var(--brand-green))]" />
                  <span className="text-sm font-medium text-foreground">Finalizando…</span>
                </div>
              )}
            </>
          }
          className="mx-6"
        />

        <div className="px-6 py-5">
          <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
            Usamos esta verificação para evitar teste grátis duplicado.
          </p>
        </div>
      </div>
    </div>
  );
}
