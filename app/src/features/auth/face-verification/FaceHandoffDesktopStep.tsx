import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Loader2, ScanFace, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FacialVerificationResult } from "@/features/auth/face-verification/facialRecognitionController";
import { facialHandoffPublicPath } from "@/features/auth/face-verification/facialHandoffConstants";
import { useFacialHandoffDesktop } from "@/features/auth/face-verification/useFacialHandoffDesktop";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onContinueOnPc: () => void;
  onVerified: (result: FacialVerificationResult) => void;
};

export function FaceHandoffDesktopStep({ open, onClose, onContinueOnPc, onVerified }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const { session, creating, expired, createError, countdownLabel, regenerate } = useFacialHandoffDesktop({
    enabled: open,
    onCompleted: onVerified,
    onFailed: () => {
      toast({
        title: "Verificação não concluída",
        description: "Tente gerar um novo QR code ou continue pelo computador.",
        variant: "destructive",
      });
      void regenerate();
    },
  });

  const handoffUrl = useMemo(() => {
    if (!session?.sessionId || typeof window === "undefined") return "";
    return `${window.location.origin}${facialHandoffPublicPath(session.sessionId)}`;
  }, [session?.sessionId]);

  useEffect(() => {
    if (!handoffUrl || expired) {
      setQrDataUrl(null);
      setQrError(null);
      return;
    }
    let cancelled = false;
    setQrError(null);
    void QRCode.toDataURL(handoffUrl, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrError("Não foi possível gerar o QR code.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handoffUrl, expired]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md glass rounded-3xl border border-border/60 shadow-soft overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-background/70 flex items-center justify-center"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-6 pb-3 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-brand text-white mb-2">
            <ScanFace className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-semibold">Reconhecimento facial</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">Escaneie e faça pelo seu celular.</p>
        </div>

        <div className="px-6 pb-2 flex flex-col items-center gap-3">
          {creating ? (
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-border/60 bg-card/40">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : createError ? (
            <div className="text-center space-y-3 py-4 max-w-[260px]">
              <p className="text-sm text-muted-foreground">{createError}</p>
              <Button type="button" className="rounded-full" onClick={() => void regenerate()}>
                Tentar novamente
              </Button>
            </div>
          ) : expired ? (
            <div className="text-center space-y-3 py-4">
              <p className="text-sm text-muted-foreground">O QR code expirou.</p>
              <Button type="button" className="rounded-full" onClick={() => void regenerate()}>
                Gerar novo QR code
              </Button>
            </div>
          ) : !session ? (
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-border/60 bg-card/40">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : qrError ? (
            <div className="text-center space-y-3 py-4">
              <p className="text-sm text-muted-foreground">{qrError}</p>
              <Button type="button" className="rounded-full" onClick={() => void regenerate()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code para verificação facial no celular" className="rounded-2xl border border-border/60" width={220} height={220} />
              ) : (
                <div className="flex h-[220px] w-[220px] items-center justify-center rounded-2xl border border-border/60 bg-card/40">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                </div>
              )}
              {countdownLabel ? (
                <p className="text-xs tabular-nums text-muted-foreground">Expira em {countdownLabel}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="px-6 pb-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="w-full rounded-full h-11" onClick={onContinueOnPc}>
            Continuar pelo PC
          </Button>
          <Button type="button" variant="outline" className="w-full rounded-full h-11 sm:hidden" onClick={onClose}>
            Voltar
          </Button>
        </div>
      </div>
    </div>
  );
}
