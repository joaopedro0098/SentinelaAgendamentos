import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSocialInAppSourceLabel,
  getSuggestedExternalBrowserLabel,
  isSocialInAppBrowser,
} from "@/lib/pwaInstall";
import { cn } from "@/lib/utils";

export type PwaInstallHelpVariant = "landing" | "app";
export type PwaInstallHelpMode = "install" | "auto-social";

type Props = {
  open: boolean;
  variant: PwaInstallHelpVariant;
  mode: PwaInstallHelpMode;
  isIos: boolean;
  onClose: () => void;
};

function PwaInstallHelpBody({
  isIos,
  variant,
  mode,
}: {
  isIos: boolean;
  variant: PwaInstallHelpVariant;
  mode: PwaInstallHelpMode;
}) {
  const isApp = variant === "app";
  const browserLabel = getSuggestedExternalBrowserLabel();
  const socialSource = getSocialInAppSourceLabel();
  const actionVerb = isIos ? "toque" : "clique";

  const socialNoteClass = isApp
    ? "rounded-2xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-foreground/90"
    : "rounded-xl bg-muted/60 px-3 py-2.5 text-foreground/90";

  const stepBadgeClass = isApp
    ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-[11px] font-semibold text-white shadow-glow"
    : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground";

  function Step({ n, children }: { n: number; children: ReactNode }) {
    return (
      <li className="flex items-start gap-3">
        <span className={stepBadgeClass}>{n}</span>
        <span className="pt-0.5 leading-snug">{children}</span>
      </li>
    );
  }

  if (mode === "auto-social") {
    return (
      <p className={cn("text-foreground/90", !isApp && "px-0.5")}>
        Detectamos que você veio do {socialSource}. Por favor, para ter uma melhor experiência, {actionVerb} nos{" "}
        <strong>três pontinhos</strong> do navegador e depois em <strong>Abrir no {browserLabel}</strong>.
      </p>
    );
  }

  if (isSocialInAppBrowser()) {
    return (
      <p className={socialNoteClass}>
        Veio pelo Instagram ou TikTok? Para instalar o app, {actionVerb} primeiro nos{" "}
        <strong>três pontinhos</strong> do navegador e depois em <strong>Abrir no {browserLabel}</strong>.
      </p>
    );
  }

  if (isIos) {
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Toque em <strong>Compartilhar</strong>
        </Step>
        <Step n={2}>
          <strong>Adicionar à Tela de Início</strong>
        </Step>
        <Step n={3}>
          Abra pelo <strong>ícone</strong> na tela inicial
        </Step>
      </ol>
    );
  }

  return (
    <ol className="space-y-3">
      <Step n={1}>
        Clique nos <strong>3 pontinhos</strong> do navegador
      </Step>
      <Step n={2}>
        <strong>Adicionar à tela inicial</strong>
      </Step>
      <Step n={3}>
        <strong>Instalar</strong>
      </Step>
    </ol>
  );
}

function getPanelClassName(variant: PwaInstallHelpVariant) {
  if (variant === "app") {
    return "glass-panel rounded-2xl border-border/80 shadow-xl";
  }
  return "rounded-2xl border border-border bg-background shadow-lg";
}

function getActionClassName(variant: PwaInstallHelpVariant) {
  if (variant === "app") {
    return "w-full rounded-full bg-gradient-brand text-white border-0 hover:opacity-90";
  }
  return "w-full rounded-full";
}

export function PwaInstallHelpDialog({ open, variant, mode, isIos, onClose }: Props) {
  const showTitle = mode === "install";

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar instruções"
        className="absolute inset-0 bg-black/80 animate-in fade-in-0"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={showTitle ? "pwa-install-help-title" : undefined}
        aria-label={showTitle ? undefined : "Abrir no navegador"}
        className={cn(
          "relative z-[101] w-full max-w-sm p-6 animate-in fade-in-0 zoom-in-95",
          getPanelClassName(variant),
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className={cn("pr-6", showTitle ? "space-y-4" : "pt-1")}>
          {showTitle && (
            <h2 id="pwa-install-help-title" className="text-base font-semibold leading-none">
              Como instalar
            </h2>
          )}
          <div className="text-sm leading-relaxed text-muted-foreground">
            <PwaInstallHelpBody isIos={isIos} variant={variant} mode={mode} />
          </div>
        </div>

        <div className="mt-6">
          <Button type="button" className={getActionClassName(variant)} onClick={onClose}>
            Entendi
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
