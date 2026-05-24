import { useCallback, useEffect, useState } from "react";
import { Loader2, ScanFace, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  const [progress, setProgress] = useState<FacialVerificationProgress>({
    stage: "camera",
    message: "Olhe para a câmera",
  });
  const [livenessActive, setLivenessActive] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const finishVerification = useCallback(async () => {
    setProcessing(true);
    setLivenessActive(false);
    setProgress({ stage: "embedding", message: "Finalizando verificação…" });

    try {
      const canvas = captureFrame();
      stop();
      if (!canvas) throw new Error("Não foi possível capturar a imagem. Tente novamente.");

      const embedding = await buildEmbeddingFromSnapshot(canvas, setProgress);
      setProgress({ stage: "checking", message: "Validando…" });
      const { trialEligible, facialMatch } = await checkFacialTrialEligibility(embedding);

      setProgress({ stage: "done", message: "Pronto ✅" });
      onVerified({ embedding, trialEligible, facialMatch });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha na verificação facial.";
      setFailed(msg);
      setProgress({ stage: "error", message: msg });
    } finally {
      setProcessing(false);
    }
  }, [captureFrame, stop, onVerified]);

  const handleLivenessComplete = useCallback(() => {
    void finishVerification();
  }, [finishVerification]);

  const { message, faceDetected, phase } = useLiveness({
    video: ready ? videoRef.current : null,
    active: open && livenessActive && !processing,
    onComplete: handleLivenessComplete,
  });

  useEffect(() => {
    if (!open) {
      setLivenessActive(false);
      setProcessing(false);
      setFailed(null);
      stop();
      return;
    }
    setProgress({ stage: "camera", message: "Olhe para a câmera" });
    setFailed(null);
    void start().then(() => setLivenessActive(true));
    return () => stop();
  }, [open, start, stop]);

  useEffect(() => {
    if (livenessActive && !processing && phase !== "done") {
      setProgress({ stage: "liveness", message });
    }
  }, [message, livenessActive, processing, phase]);

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

        <div className="px-6 pt-6 pb-4 text-center space-y-1">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand text-white mb-1">
            <ScanFace className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-semibold">Verificação rápida</h2>
          <p className="text-xs text-muted-foreground">Leva poucos segundos. Só rodamos no seu aparelho.</p>
        </div>

        <div className="relative mx-6 aspect-[4/3] rounded-2xl overflow-hidden bg-black/90">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" playsInline muted />
          <div
            className={cn(
              "pointer-events-none absolute inset-6 rounded-[40%] border-2 transition-colors duration-300",
              faceDetected ? "border-[hsl(var(--brand-green)/0.85)]" : "border-white/40",
              phase === "done" && "border-[hsl(var(--brand-green))]",
            )}
          />
          {(processing || !ready) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
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
                void start().then(() => setLivenessActive(true));
              }}
            >
              Tentar novamente
            </Button>
          )}

          <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
            Usamos apenas esta foto para evitar teste grátis duplicado. Nada é enviado a serviços pagos externos.
          </p>
        </div>
      </div>
    </div>
  );
}

export { FACIAL_TRIAL_BLOCKED_MESSAGE };
