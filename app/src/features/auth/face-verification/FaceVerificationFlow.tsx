import { lazy, Suspense, useEffect, useState } from "react";
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
};

export function FaceVerificationFlow({
  open,
  onClose,
  onVerified,
  orientationVariant = "overlay",
}: Props) {
  const [step, setStep] = useState<"orient" | "verify">("orient");

  useEffect(() => {
    if (open) setStep("orient");
  }, [open]);

  if (!open) return null;

  if (step === "orient") {
    return (
      <FaceVerificationOrientation
        variant={orientationVariant}
        onProceed={() => setStep("verify")}
        onClose={onClose}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">Carregando verificação…</p>
        </div>
      }
    >
      <FaceVerification open onClose={onClose} onVerified={onVerified} />
    </Suspense>
  );
}
