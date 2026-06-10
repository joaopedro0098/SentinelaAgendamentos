import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FacialVerificationResult } from "./facialRecognitionController";
import { FaceVerificationOrientation } from "./FaceVerificationOrientation";

const FaceVerification = lazy(() =>
  import("./FaceVerification").then((m) => ({ default: m.FaceVerification })),
);

type Props = {
  open: boolean;
  onClose: () => void;
  onVerified: (result: FacialVerificationResult) => void;
  orientationVariant?: "page" | "overlay";
  busy?: boolean;
  busyMessage?: string;
};

function BusyOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-3 bg-background/90 backdrop-blur-sm">
      <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--brand-green))] border-t-transparent animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function FaceVerificationFlow({
  open,
  onClose,
  onVerified,
  orientationVariant = "overlay",
  busy = false,
  busyMessage = "Concluindo…",
}: Props) {
  const [step, setStep] = useState<"orient" | "verify">("orient");
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) setStep("orient");
    prevOpenRef.current = open;
  }, [open]);

  // Baixa os modelos (~6 MB) enquanto o usuário lê as instruções, antes da câmera abrir.
  useEffect(() => {
    if (!open) return;
    void import("./faceEmbeddingService").then((m) => m.preloadFaceApiModels()).catch(() => undefined);
    void import("./useLiveness").then((m) => m.preloadFaceLandmarker()).catch(() => undefined);
  }, [open]);

  if (!open) return null;

  if (step === "orient") {
    return (
      <>
        <FaceVerificationOrientation
          variant={orientationVariant}
          onProceed={() => setStep("verify")}
          onClose={onClose}
        />
        {busy ? <BusyOverlay message={busyMessage} /> : null}
      </>
    );
  }

  return (
    <>
      <Suspense
        fallback={
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground">Carregando verificação…</p>
          </div>
        }
      >
        <FaceVerification open onClose={onClose} onVerified={onVerified} />
      </Suspense>
      {busy ? <BusyOverlay message={busyMessage} /> : null}
    </>
  );
}
