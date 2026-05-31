import { ScanFace, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  onProceed: () => void;
  onClose?: () => void;
  variant?: "page" | "overlay";
};

export function FaceVerificationOrientation({ onProceed, onClose, variant = "overlay" }: Props) {
  const card = (
    <div className="relative w-full max-w-md glass rounded-3xl border border-border/60 shadow-soft overflow-hidden">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-background/70 flex items-center justify-center"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      ) : null}

      <div className="px-6 pt-8 pb-5 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-brand text-white mb-4">
          <ScanFace className="w-7 h-7" />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">Reconhecimento facial</h2>
        <p className="mt-4 text-lg sm:text-xl font-semibold text-foreground leading-snug">
          Vá para um local bem iluminado.
        </p>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          Sem luz suficiente, a verificação falha e você precisa tentar de novo.
        </p>
      </div>

      <div className="mx-6 mb-7 flex items-start gap-3 rounded-2xl border border-[hsl(var(--brand-green)/0.25)] bg-[hsl(var(--brand-green)/0.08)] px-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand-green)/0.15)] text-[hsl(var(--brand-green))]">
          <Sun className="h-5 w-5" />
        </div>
        <p className="text-base font-medium text-foreground leading-snug pt-1.5">
          Fique de frente para a luz, com o rosto descoberto.
        </p>
      </div>

      <div className="px-6 pb-8">
        <Button
          type="button"
          className="w-full h-11 rounded-full bg-gradient-brand hover:opacity-90 text-white border-0 shadow-glow"
          onClick={onProceed}
        >
          Prosseguir
        </Button>
      </div>
    </div>
  );

  if (variant === "page") {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center px-4 bg-background")}>
        {card}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      {card}
    </div>
  );
}
