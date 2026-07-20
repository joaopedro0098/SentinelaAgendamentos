import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { claimFacialHandoffSession, submitFacialHandoffComplete } from "@/lib/facialHandoffApi";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";

const FaceVerificationFlow = lazy(() =>
  import("@/features/auth/face-verification/FaceVerificationFlow").then((m) => ({
    default: m.FaceVerificationFlow,
  })),
);

type Phase = "loading" | "claim_error" | "verify" | "submitting" | "done";

function claimErrorMessage(code: string) {
  if (code === "expired") return "QR code expirado";
  if (code === "already_claimed") return "Este QR code já está em uso em outro aparelho.";
  return "QR code inválido";
}

export default function FacialVerificationHandoffPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session")?.trim() ?? "";
  const [phase, setPhase] = useState<Phase>("loading");
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Verificação facial — Sentinela Agendamentos";
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setClaimError("Link inválido. Gere um novo QR code no computador.");
      setPhase("claim_error");
      return;
    }

    let cancelled = false;
    void claimFacialHandoffSession(sessionId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setClaimError(claimErrorMessage(result.error));
        setPhase("claim_error");
        return;
      }
      setPhase("verify");
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleVerified(result: FacialVerificationResult) {
    if (!sessionId) return;
    setPhase("submitting");
    try {
      await submitFacialHandoffComplete(sessionId, result.embedding);
      setPhase("done");
    } catch {
      setClaimError("Não foi possível enviar a verificação. Tente novamente no computador.");
      setPhase("claim_error");
    }
  }

  if (phase === "loading") {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Preparando verificação…</p>
      </main>
    );
  }

  if (phase === "claim_error") {
    const title = claimError?.includes("expirado") ? "QR code expirado" : "Não foi possível abrir";
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md glass rounded-2xl border border-border/60 p-6 text-center space-y-4 shadow-soft">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{claimError}</p>
          <p className="text-sm text-muted-foreground">
            Volte ao computador e toque em <strong className="font-semibold text-foreground">Gerar novo QR code</strong>.
          </p>
        </div>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md glass rounded-2xl border border-border/60 p-6 text-center space-y-3 shadow-soft">
          <h1 className="font-display text-xl font-semibold">Verificação enviada</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pronto! Pode fechar esta página — o cadastro continua no seu computador.
          </p>
        </div>
      </main>
    );
  }

  if (phase === "submitting") {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Enviando verificação…</p>
      </main>
    );
  }

  return (
    <Suspense
      fallback={
        <main className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      }
    >
      <FaceVerificationFlow
        open
        orientationVariant="page"
        onClose={() => window.history.back()}
        onVerified={(result) => void handleVerified(result)}
      />
    </Suspense>
  );
}
