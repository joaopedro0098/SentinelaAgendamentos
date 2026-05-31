import { ScanFace, X } from "lucide-react";
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

      <div className="px-6 pt-8 pb-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-brand text-white mb-3">
          <ScanFace className="w-6 h-6" />
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Reconhecimento facial</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Vá para um local bem iluminado para que possamos realizar o reconhecimento facial.
        </p>
      </div>

      <ul className="mx-6 mb-6 space-y-2.5 text-sm text-muted-foreground">
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-green))]" />
          <span>Prefira luz natural ou um ambiente claro</span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-green))]" />
          <span>Evite contraluz ou ficar de costas para a janela</span>
        </li>
        <li className="flex gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--brand-green))]" />
          <span>Mantenha o rosto visível, sem boné ou óculos escuros</span>
        </li>
      </ul>

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
