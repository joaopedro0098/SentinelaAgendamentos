import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  claimFacialHandoffSession,
  FacialHandoffSubmitError,
  submitFacialHandoffComplete,
} from "@/lib/facialHandoffApi";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";

const FaceVerificationFlow = lazy(() =>
  import("@/features/auth/face-verification/FaceVerificationFlow").then((m) => ({
    default: m.FaceVerificationFlow,
  })),
);

type Phase = "loading" | "claim_error" | "verify" | "submitting" | "submit_error" | "done";

function claimErrorMessage(code: string) {
  if (code === "expired") return "Este QR code expirou.";
  if (code === "already_claimed") return "Outro aparelho já está usando este QR code.";
  return "Link inválido ou expirado.";
}

function submitErrorCopy(code: string): { title: string; description: string; retryOnPhone: boolean } {
  switch (code) {
    case "invalid_embedding":
      return {
        title: "Não lemos o rosto desta vez",
        description: "Ajuste a iluminação, encaixe o rosto no oval e tente de novo aqui no celular.",
        retryOnPhone: true,
      };
    case "expired":
      return {
        title: "QR code expirado",
        description: "Gere um novo QR code no computador para continuar.",
        retryOnPhone: false,
      };
    case "not_claimed":
    case "session_busy":
      return {
        title: "Sessão indisponível",
        description: "Abra o link do QR code de novo. Se persistir, gere um novo QR no computador.",
        retryOnPhone: true,
      };
    case "network":
      return {
        title: "Sem conexão com o servidor",
        description: "Confira a internet e tente enviar de novo.",
        retryOnPhone: true,
      };
    default:
      return {
        title: "Não enviamos para o computador",
        description: "Algo falhou ao sincronizar. Tente de novo no celular ou gere outro QR no PC.",
        retryOnPhone: true,
      };
  }
}

export default function FacialVerificationHandoffPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session")?.trim() ?? "";
  const [phase, setPhase] = useState<Phase>("loading");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ title: string; description: string; retryOnPhone: boolean } | null>(
    null,
  );
  const [verifyKey, setVerifyKey] = useState(0);

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
    setSubmitError(null);
    try {
      await submitFacialHandoffComplete(sessionId, result.embedding);
      setPhase("done");
    } catch (err) {
      const code = err instanceof FacialHandoffSubmitError ? err.code : "unknown";
      setSubmitError(submitErrorCopy(code));
      setPhase("submit_error");
    }
  }

  function retryOnPhone() {
    setSubmitError(null);
    setVerifyKey((n) => n + 1);
    setPhase("verify");
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
    const title = claimError?.includes("expirou") ? "QR code expirado" : "Link inválido";
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md glass rounded-2xl border border-border/60 p-6 text-center space-y-3 shadow-soft">
          <h1 className="font-display text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{claimError}</p>
        </div>
      </main>
    );
  }

  if (phase === "submit_error" && submitError) {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md glass rounded-2xl border border-border/60 p-6 text-center space-y-4 shadow-soft">
          <h1 className="font-display text-xl font-semibold">{submitError.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{submitError.description}</p>
          {submitError.retryOnPhone ? (
            <Button type="button" className="w-full rounded-full" onClick={retryOnPhone}>
              Tentar novamente no celular
            </Button>
          ) : null}
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
            Pode fechar esta página — o cadastro continua no computador.
          </p>
        </div>
      </main>
    );
  }

  if (phase === "submitting") {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Enviando para o computador…</p>
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
        key={verifyKey}
        open
        orientationVariant="page"
        onClose={() => window.history.back()}
        onVerified={(result) => void handleVerified(result)}
      />
    </Suspense>
  );
}
