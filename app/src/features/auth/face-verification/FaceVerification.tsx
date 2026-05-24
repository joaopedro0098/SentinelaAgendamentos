import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ScanFace, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toUserFaceError } from "./faceEmbeddingService";
import { useCamera } from "./useCamera";
import { useLiveness } from "./useLiveness";
import {
  buildEmbeddingFromSnapshot,
  checkFacialTrialEligibility,
  FACIAL_TRIAL_BLOCKED_MESSAGE,
  type FacialVerificationProgress,
  type FacialVerificationResult,
} from "./facialRecognitionController";

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
      stop();

      const embedding = await buildEmbeddingFromSnapshot(canvas, setProgress);
      setProgress({ stage: "checking", message: "Validando…" });
      const { trialEligible, facialMatch } = await checkFacialTrialEligibility(embedding);

      setProgress({ stage: "done", message: "Pronto ✅" });
      onVerified({ embedding, trialEligible, facialMatch });
    } catch (e) {
      setFailed(toUserFaceError(e));
      setProgress({ stage: "liveness", message: "Olhe para a câmera" });
    } finally {
      setProcessing(false);
      finishingRef.current = false;
    }
  }, [captureFrame, stop, onVerified]);

  const handleLivenessComplete = useCallback(() => {
    void finishVerification();
  }, [finishVerification]);

  const { message, faceDetected } = useLiveness({
    key: attempt,
    video: ready ? videoRef.current : null,
    active: open && livenessActive && !processing,
    onComplete: handleLivenessComplete,
  });

  useEffect(() => {
    if (!open) {
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
    void start().then(() => setLivenessActive(true));
    return () => stop();
  }, [open, start, stop, attempt]);

  useEffect(() => {
    if (livenessActive && !processing && !failed) {
      setProgress({ stage: "liveness", message });
    }
  }, [message, livenessActive, processing, failed]);

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

        <div className="px-6 pt-6 pb-4 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand text-white mb-2">
            <ScanFace className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-semibold">Verificação facial</h2>
        </div>

        <div className="relative mx-6 aspect-[3/4] max-h-[min(58vh,400px)] rounded-2xl overflow-hidden bg-black">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" playsInline muted />

          {/* Contorno vertical em formato de rosto — só a borda, sem área branca por fora */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={cn(
                "w-[68%] h-[80%] border-[3.5px] transition-colors duration-300",
                "rounded-[48%_48%_42%_42%_/_54%_54%_46%_46%]",
                faceDetected ? "border-[hsl(var(--brand-green))]" : "border-white/30",
              )}
            />
          </div>

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
          )}

          {processing && (
            <div className="absolute inset-x-0 bottom-0 py-3 bg-gradient-to-t from-black/60 to-transparent flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white mr-2" />
              <span className="text-xs text-white/90 self-center">Finalizando…</span>
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-3">
          <p className="text-center text-sm font-medium min-h-[1.25rem]">{progress.message}</p>

          {cameraError && <p className="text-center text-sm text-destructive">{cameraError}</p>}
          {failed && <p className="text-center text-sm text-destructive">{failed}</p>}

          {failed && (
            <Button
              type="button"
              className="w-full rounded-full"
              variant="secondary"
              onClick={() => {
                setFailed(null);
                setProcessing(false);
                finishingRef.current = false;
                setAttempt((n) => n + 1);
              }}
            >
              Tentar novamente
            </Button>
          )}

          <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
            Usamos esta verificação para evitar teste grátis duplicado.
          </p>
        </div>
      </div>
    </div>
  );
}

export { FACIAL_TRIAL_BLOCKED_MESSAGE };
